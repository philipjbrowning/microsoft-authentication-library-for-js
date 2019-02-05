/**
 * Copyright (c) Microsoft Corporation
 *  All Rights Reserved
 *  MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the 'Software'), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
 * OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { AccessTokenCacheItem } from "./AccessTokenCacheItem";
import { AccessTokenKey } from "./AccessTokenKey";
import { AccessTokenValue } from "./AccessTokenValue";
import { AuthenticationRequestParameters } from "./AuthenticationRequestParameters";
import { Authority } from "./Authority";
import { HomeAccountIdentifier } from "./HomeAccountIdentifier";
import { Constants, ErrorCodes, ErrorDescription } from "./Constants";
import { IdToken } from "./IdToken";
import { Logger } from "./Logger";
import { Storage } from "./Storage";
import { TokenResponse } from "./RequestInfo";
import { Account } from "./Account";
import { Utils } from "./Utils";
import { AuthorityFactory } from "./AuthorityFactory";
import { TConfiguration, Configuration } from "./Configuration";
import { AuthenticationParameters } from "./Request";

declare global {
  interface Window {
    msal: Object;
    CustomEvent: CustomEvent;
    Event: Event;
    activeRenewals: {};
    renewStates: Array<string>;
    callBackMappedToRenewStates: {};
    callBacksMappedToRenewStates: {};
    openedWindows: Array<Window>;
    requestType: string;
  }
}

/*
 * @hidden
 */
let ResponseTypes = {
  id_token: "id_token",
  token: "token",
  id_token_token: "id_token token"
};

/*
 * @hidden
 */
export interface CacheResult {
  errorDesc: string;
  token: string;
  error: string;
}

/*
 * A type alias of for a tokenReceivedCallback function.
 * @param tokenReceivedCallback.errorDesc error description returned from the STS if API call fails.
 * @param tokenReceivedCallback.token token returned from STS if token request is successful.
 * @param tokenReceivedCallback.error error code returned from the STS if API call fails.
 * @param tokenReceivedCallback.tokenType tokenType returned from the STS if API call is successful. Possible values are: id_token OR access_token.
 */
export type tokenReceivedCallback = (errorDesc: string, token: string, error: string, tokenType: string, userState: string) => void;


/*
 * wrapper around acquireTokenSilent() to handle tokens out of iframe
 * TODO: Get more details and usecases from the history
 */
const resolveTokenOnlyIfOutOfIframe = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  const tokenAcquisitionMethod = descriptor.value;
  descriptor.value = function (...args: any[]) {
    return this.isInIframe()
      ? new Promise(() => {
        return;
      })
      : tokenAcquisitionMethod.apply(this, args);
  };
  return descriptor;
};


/*
 * UserAgentApplication class
 *
 */
export class UserAgentApplication {

  /**
   * All Config Params in a single object
   */
  pConfig: TConfiguration;

  /** 
   * @hidden
   * TODO: Remove this from Configuration and add this as a parameter to redirect() calls
   */
  private pTokenReceivedCallback: tokenReceivedCallback = null;

  /** Authority Support Code */

  /** 
   * @hidden
   */
  protected authorityInstance: Authority;

  /*
   * Used to set the authority.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://&lt;tenant&gt;/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://&lt;instance&gt;/tfp/&lt;tenant&gt;/<policyName>/
   * - Default value is: "https://login.microsoftonline.com/common"
   */
  public set authority(val) {
    this.authorityInstance = AuthorityFactory.CreateInstance(val, this.pConfig.auth.validateAuthority);
  }

  /*
   * Used to get the authority.
   */
  public get authority(): string {
    return this.authorityInstance.CanonicalAuthority;
  }

  /** 
   * Validate cache location and initialize storage 
   */

  /** 
   * @hidden
   */
  private cacheLocations = {
    localStorage: "localStorage",
    sessionStorage: "sessionStorage"
  };

  /** 
   * Used to get the cache location
   */
  get cacheLocation(): string {
    return this.pConfig.cache.cacheLocation;
  }
  /** 
   * @hidden
   */
  protected pCacheStorage: Storage;


  /** Other Variables */

  /** 
   * @hidden 
   * Tracks if login is already initiated
   */
  private pLoginInProgress: boolean;

  /** 
   * @hidden
   * Tracks in Token Request is already initiated
   */
  private pAcquireTokenInProgress: boolean;

  /**
   * @hidden
   */
  private pSilentAuthenticationState: string;

  /**
   * @hidden
   */
  private pSilentLogin: boolean;

  /** 
   * @hidden
   * Account object - Current login/token request account
   */
  private pAccount: Account;

  /** 
   * Initialize a UserAgentApplication with a given clientId and authority.
   * @constructor
   * @param {string} clientId - The clientID of your application, you should get this from the application registration portal.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://&lt;instance>/&lt;tenant&gt;,\ where &lt;instance&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://&lt;instance&gt;/tfp/&lt;tenantId&gt;/&lt;policyName&gt;/
   * - Default value is: "https://login.microsoftonline.com/common"
   * @param pTokenReceivedCallback -  The function that will get the call back once this API is completed (either successfully or with a failure).
   * @param {boolean} validateAuthority -  boolean to turn authority validation on/off.
   */
  constructor(config: TConfiguration, callback: tokenReceivedCallback) {

    // Set the Configuration 
    this.pConfig = config;

    // Set the callback
    this.pTokenReceivedCallback = callback;

    // TODO: New design for redirect - add a new function. Placeholder until then
    // this.pTokenReceivedCallback = tokenReceivedCallback;

    this.pLoginInProgress = false;
    this.pAcquireTokenInProgress = false;

    if (!this.cacheLocations[this.pConfig.cache.cacheLocation]) {
      throw new Error("Cache Location is not valid. Provided value:" + this.pConfig.cache.cacheLocation + ".Possible values are: " + this.cacheLocations.localStorage + ", " + this.cacheLocations.sessionStorage);
    }
    this.pCacheStorage = new Storage(this.pConfig.cache.cacheLocation); //cache keys msal

    // Initialize the Window Handling code
    // TODO: refactor - write a utility function 
    window.openedWindows = [];
    window.activeRenewals = {};
    window.renewStates = [];
    window.callBackMappedToRenewStates = {};
    window.callBacksMappedToRenewStates = {};
    window.msal = this;
    var urlHash = window.location.hash;
    var isCallback = this.isCallback(urlHash);

    // On the Server 302 - Redirect, handle this
    if (!this.pConfig.framework.isAngular) {
      if (isCallback) {
        this.handleAuthenticationResponse.call(this, urlHash);
      }
      else {
        var pendingCallback = this.pCacheStorage.getItem(Constants.urlHash);
        if (pendingCallback) {
          this.processCallBack(pendingCallback);
        }
      }
    }
  }

  /** 
   * Used to get the redirect uri. Evaluates redirectUri if its a function, otherwise simply returns its value.
   * @ignore
   * @hidden
   */
  private getRedirectUri(): string {
    if (typeof this.pConfig.auth.redirectUri === "function") {
      return this.pConfig.auth.redirectUri();
    }
    return this.pConfig.auth.redirectUri;
  }


  /** 
   * Used to get the post logout redirect uri. Evaluates postLogoutredirectUri if its a function, otherwise simply returns its value.
   * @ignore
   * @hidden
   */
  private getPostLogoutRedirectUri(): string {
    if (typeof this.pConfig.auth.postLogoutRedirectUri === "function") {
      return this.pConfig.auth.postLogoutRedirectUri();
    }
    return this.pConfig.auth.postLogoutRedirectUri;
  }


  /** 
   * Used to call the constructor callback with the token/error
   * @param {string} [hash=window.location.hash] - Hash fragment of Url.
   * @hidden
   */
  private processCallBack(hash: string): void {
    this.pConfig.system.logger.info("Processing the callback from redirect response");
    const requestInfo = this.getRequestInfo(hash);
    this.saveTokenFromHash(requestInfo);
    const token = requestInfo.parameters[Constants.accessToken] || requestInfo.parameters[Constants.idToken];
    const errorDesc = requestInfo.parameters[Constants.errorDescription];
    const error = requestInfo.parameters[Constants.error];
    var tokenType: string;

    if (requestInfo.parameters[Constants.accessToken]) {
      tokenType = Constants.accessToken;
    }
    else {
      tokenType = Constants.idToken;
    }

    this.pCacheStorage.removeItem(Constants.urlHash);

    try {
      if (this.pTokenReceivedCallback) {
        this.pCacheStorage.clearCookie();
        this.pTokenReceivedCallback.call(this, errorDesc, token, error, tokenType, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
      }

    } catch (err) {
      this.pConfig.system.logger.error("Error occurred in token received callback function: " + err);
    }
  }


  /** 
   * Initiate the login process by redirecting the user to the STS authorization endpoint.
   * @param {Array.<string>} scopes - Permissions you want included in the access token. Not all scopes are guaranteed to be included in the access token returned.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the authentication server during the interactive authentication flow.
   */
  loginRedirect(scopes?: Array<string>, extraQueryParameters?: string): void {
    /*
    1. Create navigate url
    2. saves value in cache
    3. redirect user to AAD
     */
    if (this.pLoginInProgress) {
      if (this.pTokenReceivedCallback) {
        this.pTokenReceivedCallback(ErrorDescription.loginProgressError, null, ErrorCodes.loginProgressError, Constants.idToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
        return;
      }
    }

    if (scopes) {
      const isValidScope = this.validateInputScope(scopes);
      if (isValidScope && !Utils.isEmpty(isValidScope)) {
        if (this.pTokenReceivedCallback) {
          this.pTokenReceivedCallback(ErrorDescription.inputScopesError, null, ErrorCodes.inputScopesError, Constants.idToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
          return;
        }
      }
      scopes = this.filterScopes(scopes);
    }

    var idTokenObject;
    idTokenObject = this.extractADALIdToken();
    if (idTokenObject && !scopes) {
      this.pConfig.system.logger.info("ADAL's idToken exists. Extracting login information from ADAL's idToken ");
      extraQueryParameters = Utils.constructUnifiedCacheExtraQueryParameter(idTokenObject, extraQueryParameters);
      this.pSilentLogin = true;
      this.acquireTokenSilent([this.pConfig.auth.clientId], this.authority, this.getAccount(), extraQueryParameters)
        .then((idToken) => {
          this.pSilentLogin = false;
          this.pConfig.system.logger.info("Unified cache call is successful");
          if (this.pTokenReceivedCallback) {
            this.pTokenReceivedCallback.call(this, null, idToken, null, Constants.idToken, this.getAccountState(this.pSilentAuthenticationState));
          }
        }, (error) => {
          this.pSilentLogin = false;
          this.pConfig.system.logger.error("Error occurred during unified cache ATS");
          this.loginRedirectHelper(scopes, extraQueryParameters);
        });
    }
    else {
      this.loginRedirectHelper(scopes, extraQueryParameters);
    }
  }

  /**
   * @hidden
   * @param scopes 
   * @param extraQueryParameters 
   */
  private loginRedirectHelper(scopes?: Array<string>, extraQueryParameters?: string) {
    this.pLoginInProgress = true;
    this.authorityInstance.ResolveEndpointsAsync()
      .then(() => {
        const authenticationRequest = new AuthenticationRequestParameters(this.authorityInstance, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
        if (extraQueryParameters) {
          authenticationRequest.extraQueryParameters = extraQueryParameters;
        }

        var loginStartPage = this.pCacheStorage.getItem(Constants.angularLoginRequest);
        if (!loginStartPage || loginStartPage === "") {
          loginStartPage = window.location.href;
        }
        else {
          this.pCacheStorage.setItem(Constants.angularLoginRequest, "");
        }

        this.pCacheStorage.setItem(Constants.loginRequest, loginStartPage, this.pConfig.cache.storeAuthStateInCookie);
        this.pCacheStorage.setItem(Constants.loginError, "");
        this.pCacheStorage.setItem(Constants.stateLogin, authenticationRequest.state, this.pConfig.cache.storeAuthStateInCookie);
        this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce, this.pConfig.cache.storeAuthStateInCookie);
        this.pCacheStorage.setItem(Constants.msalError, "");
        this.pCacheStorage.setItem(Constants.msalErrorDescription, "");
        const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
        this.pCacheStorage.setItem(authorityKey, this.authority, this.pConfig.cache.storeAuthStateInCookie);
        const urlNavigate = authenticationRequest.createNavigateUrl(scopes) + Constants.response_mode_fragment;
        this.promptUser(urlNavigate);
      });
  }

  /** 
   * Initiate the login process by redirecting the user to the STS authorization endpoint.
   * TODO: Refactor removing extraQueryParams
   * 
   * @param {Array.<string>} scopes - Permissions you want included in the access token. Not all scopes are guaranteed to be included in the access token returned.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the authentication server during the interactive authentication flow.
   */
  loginRedirectNew(authParams: AuthenticationParameters): void {
    /*
    1. Create navigate url
    2. saves value in cache
    3. redirect user to AAD
     */
    if (this.pLoginInProgress) {
      if (this.pTokenReceivedCallback) {
        this.pTokenReceivedCallback(ErrorDescription.loginProgressError, null, ErrorCodes.loginProgressError, Constants.idToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
        return;
      }
    }

    if (authParams.scopes) {
      const isValidScope = this.validateInputScope(authParams.scopes);
      if (isValidScope && !Utils.isEmpty(isValidScope)) {
        if (this.pTokenReceivedCallback) {
          this.pTokenReceivedCallback(ErrorDescription.inputScopesError, null, ErrorCodes.inputScopesError, Constants.idToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
          return;
        }
      }
      authParams.scopes = this.filterScopes(authParams.scopes);
    }

    var idTokenObject;
    idTokenObject = this.extractADALIdToken();
    // construct extraQueryParams string
    let extraQueryParameters = Utils.constructExtraQueryParametersString(authParams.extraQueryParameters);

    if (idTokenObject && !authParams.scopes) {

      this.pConfig.system.logger.info("ADAL's idToken exists. Extracting login information from ADAL's idToken ");
     
      if (authParams.login_hint) {
        extraQueryParameters = Utils.constructUnifiedCacheExtraQueryParameter(idTokenObject, authParams.login_hint, extraQueryParameters );
      }

      this.pSilentLogin = true;
      this.acquireTokenSilent([this.pConfig.auth.clientId], this.authority, this.getAccount(), extraQueryParameters)
        .then((idToken) => {
          this.pSilentLogin = false;
          this.pConfig.system.logger.info("Unified cache call is successful");
          if (this.pTokenReceivedCallback) {
            this.pTokenReceivedCallback.call(this, null, idToken, null, Constants.idToken, this.getAccountState(this.pSilentAuthenticationState));
          }
        }, (error) => {
          this.pSilentLogin = false;
          this.pConfig.system.logger.error("Error occurred during unified cache ATS");
          this.loginRedirectHelperNew(authParams.scopes, extraQueryParameters);
        });
    }
    else {
      this.loginRedirectHelper(authParams.scopes, extraQueryParameters);
    }
  }

  /**
   * @hidden
   * TODO: extraQueryParams - refactor
   * 
   * @param scopes 
   * @param extraQueryParameters 
   */
  private loginRedirectHelperNew(scopes?: Array<string>, extraQueryParameters?: string) {
    this.pLoginInProgress = true;
    this.authorityInstance.ResolveEndpointsAsync()
      .then(() => {
        const authenticationRequest = new AuthenticationRequestParameters(this.authorityInstance, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
        if (extraQueryParameters) {
          authenticationRequest.extraQueryParameters = extraQueryParameters;
        }

        var loginStartPage = this.pCacheStorage.getItem(Constants.angularLoginRequest);
        if (!loginStartPage || loginStartPage === "") {
          loginStartPage = window.location.href;
        }
        else {
          this.pCacheStorage.setItem(Constants.angularLoginRequest, "");
        }

        this.pCacheStorage.setItem(Constants.loginRequest, loginStartPage, this.pConfig.cache.storeAuthStateInCookie);
        this.pCacheStorage.setItem(Constants.loginError, "");
        this.pCacheStorage.setItem(Constants.stateLogin, authenticationRequest.state, this.pConfig.cache.storeAuthStateInCookie);
        this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce, this.pConfig.cache.storeAuthStateInCookie);
        this.pCacheStorage.setItem(Constants.msalError, "");
        this.pCacheStorage.setItem(Constants.msalErrorDescription, "");
        const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
        this.pCacheStorage.setItem(authorityKey, this.authority, this.pConfig.cache.storeAuthStateInCookie);
        const urlNavigate = authenticationRequest.createNavigateUrl(scopes) + Constants.response_mode_fragment;
        this.promptUser(urlNavigate);
      });
  }


  /** 
   * Initiate the login process by opening a popup window.
   * @param {Array.<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token returned.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the interactive authentication flow.
   * @returns {Promise.<string>} - A Promise that is fulfilled when this function has completed, or rejected if an error was raised. Returns the token or error.
   */
  loginPopup(scopes?: Array<string>, extraQueryParameters?: string): Promise<string> {
    /*
    1. Create navigate url
    2. saves value in cache
    3. redirect user to AAD
     */
    return new Promise<string>((resolve, reject) => {
      if (this.pLoginInProgress) {
        reject(ErrorCodes.loginProgressError + Constants.resourceDelimeter + ErrorDescription.loginProgressError);
        return;
      }

      if (scopes) {
        const isValidScope = this.validateInputScope(scopes);
        if (isValidScope && !Utils.isEmpty(isValidScope)) {
          reject(ErrorCodes.inputScopesError + Constants.resourceDelimeter + ErrorDescription.inputScopesError);
          return;
        }

        scopes = this.filterScopes(scopes);
      }

      var idTokenObject;
      idTokenObject = this.extractADALIdToken();
      if (idTokenObject && !scopes) {
        this.pConfig.system.logger.info("ADAL's idToken exists. Extracting login information from ADAL's idToken ");
        extraQueryParameters = Utils.constructUnifiedCacheExtraQueryParameter(idTokenObject, extraQueryParameters);
        this.pSilentLogin = true;
        this.acquireTokenSilent([this.pConfig.auth.clientId], this.authority, this.getAccount(), extraQueryParameters)
          .then((idToken) => {
            this.pSilentLogin = false;
            this.pConfig.system.logger.info("Unified cache call is successful");
            resolve(idToken);
          }, (error) => {
            this.pSilentLogin = false;
            this.pConfig.system.logger.error("Error occurred during unified cache ATS");
            this.loginPopupHelper(resolve, reject, scopes, extraQueryParameters);
          });
      }
      else {
        this.loginPopupHelper(resolve, reject, scopes, extraQueryParameters);
      }
    });
  }

  /**
   * 
   * @hidden
   * TODO: extraQueryParams - refactor
   * 
   * @param resolve 
   * @param reject 
   * @param scopes 
   * @param extraQueryParameters 
   */
  private loginPopupHelper(resolve: any, reject: any, scopes: Array<string>, extraQueryParameters?: string) {
    //TODO why this is needed only for loginpopup
    if (!scopes) {
      scopes = [this.pConfig.auth.clientId];
    }
    const scope = scopes.join(" ").toLowerCase();
    var popUpWindow = this.openWindow("about:blank", "_blank", 1, this, resolve, reject);
    if (!popUpWindow) {
      return;
    }

    this.pLoginInProgress = true;

    this.authorityInstance.ResolveEndpointsAsync().then(() => {
      const authenticationRequest = new AuthenticationRequestParameters(this.authorityInstance, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
      if (extraQueryParameters) {
        authenticationRequest.extraQueryParameters = extraQueryParameters;
      }

      this.pCacheStorage.setItem(Constants.loginRequest, window.location.href, this.pConfig.cache.storeAuthStateInCookie);
      this.pCacheStorage.setItem(Constants.loginError, "");
      this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce, this.pConfig.cache.storeAuthStateInCookie);
      this.pCacheStorage.setItem(Constants.msalError, "");
      this.pCacheStorage.setItem(Constants.msalErrorDescription, "");
      const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
      this.pCacheStorage.setItem(authorityKey, this.authority, this.pConfig.cache.storeAuthStateInCookie);
      const urlNavigate = authenticationRequest.createNavigateUrl(scopes) + Constants.response_mode_fragment;
      window.renewStates.push(authenticationRequest.state);
      window.requestType = Constants.login;
      this.registerCallback(authenticationRequest.state, scope, resolve, reject);
      if (popUpWindow) {
        this.pConfig.system.logger.infoPii("Navigated Popup window to:" + urlNavigate);
        popUpWindow.location.href = urlNavigate;
      }

    }, () => {
      this.pConfig.system.logger.info(ErrorCodes.endpointResolutionError + ":" + ErrorDescription.endpointResolutionError);
      this.pCacheStorage.setItem(Constants.msalError, ErrorCodes.endpointResolutionError);
      this.pCacheStorage.setItem(Constants.msalErrorDescription, ErrorDescription.endpointResolutionError);
      if (reject) {
        reject(ErrorCodes.endpointResolutionError + ":" + ErrorDescription.endpointResolutionError);
      }

      if (popUpWindow) {
        popUpWindow.close();
      }
    }).catch((err) => {
      this.pConfig.system.logger.warning("could not resolve endpoints");
      reject(err);
    });
  }

  /** 
     * Initiate the login process by opening a popup window.
     * TODO: extraQueryParams - refactor
     * 
     * @param {AuthenticationParameters} 
     * @returns {Promise.<string>} - A Promise that is fulfilled when this function has completed, or rejected if an error was raised. Returns the token or error.
     */
  loginPopupNew(authParams: AuthenticationParameters): Promise<string> {
    /*
    1. Create navigate url
    2. saves value in cache
    3. redirect user to AAD
     */
    return new Promise<string>((resolve, reject) => {
      if (this.pLoginInProgress) {
        reject(ErrorCodes.loginProgressError + Constants.resourceDelimeter + ErrorCodes.loginProgressError);
        return;
      }

      if (authParams.scopes) {
        const isValidScope = this.validateInputScope(authParams.scopes);
        if (isValidScope && !Utils.isEmpty(isValidScope)) {
          reject(ErrorCodes.inputScopesError + Constants.resourceDelimeter + ErrorCodes.inputScopesError);
          return;
        }

        authParams.scopes = this.filterScopes(authParams.scopes);
      }

      var idTokenObject;
      idTokenObject = this.extractADALIdToken();

      // construct extraQueryParams string
      let extraQueryParameters = Utils.constructExtraQueryParametersString(authParams.extraQueryParameters);

      if (idTokenObject && !authParams.scopes) {

        this.pConfig.system.logger.info("ADAL's idToken exists. Extracting login information from ADAL's idToken ");

        // TODO extraParameters - rewrite the utils function with the new structure and considering login_hint is no longer in extraQueryParameters
        extraQueryParameters = Utils.constructUnifiedCacheExtraQueryParameter(idTokenObject, authParams.login_hint, extraQueryParameters);

        this.pSilentLogin = true;

        // Todo - Construct a request and add the call to new acquireTokenSilent
        let authRequest: AuthenticationParameters = { scopes: [this.pConfig.auth.clientId], authority: this.authority, account: this.getAccount(), extraQueryParameters: authParams.extraQueryParameters};

        this.acquireTokenSilentNew(authRequest)
          .then((idToken) => {
            this.pSilentLogin = false;
            this.pConfig.system.logger.info("Unified cache call is successful");
            resolve(idToken);
          }, (error) => {
            this.pSilentLogin = false;
            this.pConfig.system.logger.error("Error occurred during unified cache ATS");
            this.loginPopupHelperNew(resolve, reject, authParams.scopes, extraQueryParameters);
          });


        /*
        this.acquireTokenSilent([this.pConfig.auth.clientId], this.authority, this.getAccount(), extraQueryParameters)
          .then((idToken) => {
            this.pSilentLogin = false;
            this.pConfig.system.logger.info("Unified cache call is successful");
            resolve(idToken);
          }, (error) => {
            this.pSilentLogin = false;
            this.pConfig.system.logger.error("Error occurred during unified cache ATS");
            this.loginPopupHelper(resolve, reject, authParams.scopes, extraQueryParameters);
          });
          */
      }
      else {
        this.loginPopupHelperNew(resolve, reject, authParams.scopes, extraQueryParameters);
      }
    });
  }

  /**
   * @hidden
   * TODO: extraQueryParams - refactor
   * 
   * @param resolve 
   * @param reject 
   * @param scopes 
   * @param extraQueryParameters 
   */
  loginPopupHelperNew(resolve: any, reject: any, scopes: Array<string>, extraQueryParameters?: string) {
    //TODO why this is needed only for loginpopup
    if (!scopes) {
      scopes = [this.pConfig.auth.clientId];
    }
    const scope = scopes.join(" ").toLowerCase();
    var popUpWindow = this.openWindow("about:blank", "_blank", 1, this, resolve, reject);
    if (!popUpWindow) {
      return;
    }

    this.pLoginInProgress = true;

    this.authorityInstance.ResolveEndpointsAsync().then(() => {
      const authenticationRequest = new AuthenticationRequestParameters(this.authorityInstance, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
      if (extraQueryParameters) {
        authenticationRequest.extraQueryParameters = extraQueryParameters;
      }

      this.pCacheStorage.setItem(Constants.loginRequest, window.location.href, this.pConfig.cache.storeAuthStateInCookie);
      this.pCacheStorage.setItem(Constants.loginError, "");
      this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce, this.pConfig.cache.storeAuthStateInCookie);
      this.pCacheStorage.setItem(Constants.msalError, "");
      this.pCacheStorage.setItem(Constants.msalErrorDescription, "");
      const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
      this.pCacheStorage.setItem(authorityKey, this.authority, this.pConfig.cache.storeAuthStateInCookie);
      const urlNavigate = authenticationRequest.createNavigateUrl(scopes) + Constants.response_mode_fragment;
      window.renewStates.push(authenticationRequest.state);
      window.requestType = Constants.login;
      this.registerCallback(authenticationRequest.state, scope, resolve, reject);
      if (popUpWindow) {
        this.pConfig.system.logger.infoPii("Navigated Popup window to:" + urlNavigate);
        popUpWindow.location.href = urlNavigate;
      }

    }, () => {
      this.pConfig.system.logger.info(ErrorCodes.endpointResolutionError + ":" + ErrorDescription.endpointResolutionError);
      this.pCacheStorage.setItem(Constants.msalError, ErrorCodes.endpointResolutionError);
      this.pCacheStorage.setItem(Constants.msalErrorDescription, ErrorDescription.endpointResolutionError);
      if (reject) {
        reject(ErrorCodes.endpointResolutionError + ":" + ErrorDescription.endpointResolutionError);
      }

      if (popUpWindow) {
        popUpWindow.close();
      }
    }).catch((err) => {
      this.pConfig.system.logger.warning("could not resolve endpoints");
      reject(err);
    });
  }


  /** 
   * Used to acquire an access token for a new user using interactive authentication via a popup Window.
   * To request an id_token, pass the clientId as the only scope in the scopes array.
   * @param {Array<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token. Scopes like "openid" and "profile" are sent with every request.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://&lt;tenant&gt;/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://&lt;instance&gt;/tfp/&lt;tenant&gt;/<policyName>/
   * - Default value is: "https://login.microsoftonline.com/common".
   * @param {User} user - The user for which the scopes are requested.The default user is the logged in user.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the  authentication flow.
   * @returns {Promise.<string>} - A Promise that is fulfilled when this function has completed, or rejected if an error was raised. Returns the token or error.
   */
  acquireTokenPopup(scopes: Array<string>): Promise<string>;
  acquireTokenPopup(scopes: Array<string>, authority: string): Promise<string>;
  acquireTokenPopup(scopes: Array<string>, authority: string, account: Account): Promise<string>;
  acquireTokenPopup(scopes: Array<string>, authority: string, account: Account, extraQueryParameters: string): Promise<string>;
  acquireTokenPopup(scopes: Array<string>, authority?: string, account?: Account, extraQueryParameters?: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const isValidScope = this.validateInputScope(scopes);
      if (isValidScope && !Utils.isEmpty(isValidScope)) {
        reject(ErrorCodes.inputScopesError + Constants.resourceDelimeter + isValidScope);
      }

      if (scopes) {
        scopes = this.filterScopes(scopes);
      }

      const accountObject = account ? account : this.getAccount();
      if (this.pAcquireTokenInProgress) {
        reject(ErrorCodes.acquireTokenProgressError + Constants.resourceDelimeter + ErrorDescription.acquireTokenProgressError);
        return;
      }

      const scope = scopes.join(" ").toLowerCase();
      //if user is not currently logged in and no login_hint is passed
      if (!accountObject && !(extraQueryParameters && (extraQueryParameters.indexOf(Constants.login_hint) !== -1))) {
        this.pConfig.system.logger.info("User login is required");
        reject(ErrorCodes.userLoginError + Constants.resourceDelimeter + ErrorDescription.userLoginError);
        return;
      }

      this.pAcquireTokenInProgress = true;
      let authenticationRequest: AuthenticationRequestParameters;
      let acquireTokenAuthority = authority ? AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority) : this.authorityInstance;
      var popUpWindow = this.openWindow("about:blank", "_blank", 1, this, resolve, reject);
      if (!popUpWindow) {
        return;
      }

      acquireTokenAuthority.ResolveEndpointsAsync().then(() => {
        if (Utils.compareObjects(accountObject, this.getAccount())) {
          if (scopes.indexOf(this.pConfig.auth.clientId) > -1) {
            authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
          else {
            authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
          }
        } else {
          authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
        }

        this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce);
        authenticationRequest.state = authenticationRequest.state;
        var acquireTokenUserKey;
        if (accountObject) {
          acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + accountObject.homeAccountIdentifier + Constants.resourceDelimeter + authenticationRequest.state;
        }
        else {
          acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + authenticationRequest.state;
        }

        this.pCacheStorage.setItem(acquireTokenUserKey, JSON.stringify(accountObject));
        const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
        this.pCacheStorage.setItem(authorityKey, acquireTokenAuthority.CanonicalAuthority, this.pConfig.cache.storeAuthStateInCookie);

        if (extraQueryParameters) {
          authenticationRequest.extraQueryParameters = extraQueryParameters;
        }

        let urlNavigate = authenticationRequest.createNavigateUrl(scopes) + Constants.response_mode_fragment;
        urlNavigate = this.addHintParameters(urlNavigate, accountObject);
        window.renewStates.push(authenticationRequest.state);
        window.requestType = Constants.renewToken;
        this.registerCallback(authenticationRequest.state, scope, resolve, reject);
        if (popUpWindow) {
          popUpWindow.location.href = urlNavigate;
        }

      }, () => {
        this.pConfig.system.logger.info(ErrorCodes.endpointResolutionError + ":" + ErrorDescription.endpointResolutionError);
        this.pCacheStorage.setItem(Constants.msalError, ErrorCodes.endpointResolutionError);
        this.pCacheStorage.setItem(Constants.msalErrorDescription, ErrorDescription.endpointResolutionError);
        if (reject) {
          reject(ErrorCodes.endpointResolutionError + Constants.resourceDelimeter + ErrorDescription.endpointResolutionError);
        }
        if (popUpWindow) {
          popUpWindow.close();
        }
      }).catch((err) => {
        this.pConfig.system.logger.warning("could not resolve endpoints");
        reject(err);
      });
    });
  }


  /** 
   * Used to acquire an access token for a new user using interactive authentication via a popup Window.
   * To request an id_token, pass the clientId as the only scope in the scopes array.
   * 
   * TODO: extraQueryParameters - refactor
   * 
   * @param {Array<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token. Scopes like "openid" and "profile" are sent with every request.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://&lt;tenant&gt;/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://&lt;instance&gt;/tfp/&lt;tenant&gt;/<policyName>/
   * - Default value is: "https://login.microsoftonline.com/common".
   * @param {User} user - The user for which the scopes are requested.The default user is the logged in user.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the  authentication flow.
   * @returns {Promise.<string>} - A Promise that is fulfilled when this function has completed, or rejected if an error was raised. Returns the token or error.
   */
  acquireTokenPopupNew(authParams: AuthenticationParameters): Promise<string> {

    return new Promise<string>((resolve, reject) => {
      const isValidScope = this.validateInputScope(authParams.scopes);
      if (isValidScope && !Utils.isEmpty(isValidScope)) {
        reject(ErrorCodes.inputScopesError + Constants.resourceDelimeter + isValidScope);
      }

      if (authParams.scopes) {
        authParams.scopes = this.filterScopes(authParams.scopes);
      }

      // TODO check why account is not identified
      const accountObject = authParams.account ? authParams.account : this.getAccount();

      if (this.pAcquireTokenInProgress) {
        reject(ErrorCodes.acquireTokenProgressError + Constants.resourceDelimeter + ErrorDescription.acquireTokenProgressError);
        return;
      }

      const scope = authParams.scopes.join(" ").toLowerCase();
      let extraQueryParameters = Utils.constructExtraQueryParametersString(authParams.extraQueryParameters);

      //if user is not currently logged in and no login_hint is passed 
      // TODO: authParams now pass login_hint
      //if (!accountObject && !(extraQueryParameters && (extraQueryParameters.indexOf(Constants.login_hint) !== -1))) {
        if (!accountObject && !(authParams.login_hint)) {
          this.pConfig.system.logger.info("User login is required");
          reject(ErrorCodes.userLoginError + Constants.resourceDelimeter + ErrorDescription.userLoginError);
        
          return;
      }

      this.pAcquireTokenInProgress = true;
      let authenticationRequest: AuthenticationRequestParameters;
      let acquireTokenAuthority = authParams.authority ? AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority) : this.authorityInstance;
      var popUpWindow = this.openWindow("about:blank", "_blank", 1, this, resolve, reject);
      if (!popUpWindow) {
        return;
      }

      acquireTokenAuthority.ResolveEndpointsAsync().then(() => {
        if (Utils.compareObjects(accountObject, this.getAccount())) {
          if (authParams.scopes.indexOf(this.pConfig.auth.clientId) > -1) {
            authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
          else {
            authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
          }
        } else {
          authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
        }

        this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce);
        authenticationRequest.state = authenticationRequest.state;
        var acquireTokenUserKey;
        if (accountObject) {
          acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + accountObject.homeAccountIdentifier + Constants.resourceDelimeter + authenticationRequest.state;
        }
        else {
          acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + authenticationRequest.state;
        }

        this.pCacheStorage.setItem(acquireTokenUserKey, JSON.stringify(accountObject));
        const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
        this.pCacheStorage.setItem(authorityKey, acquireTokenAuthority.CanonicalAuthority, this.pConfig.cache.storeAuthStateInCookie);

        if (extraQueryParameters) {
          authenticationRequest.extraQueryParameters = extraQueryParameters;
        }

        let urlNavigate = authenticationRequest.createNavigateUrl(authParams.scopes) + Constants.response_mode_fragment;
        urlNavigate = this.addHintParameters(urlNavigate, accountObject);
        window.renewStates.push(authenticationRequest.state);
        window.requestType = Constants.renewToken;
        this.registerCallback(authenticationRequest.state, scope, resolve, reject);
        if (popUpWindow) {
          popUpWindow.location.href = urlNavigate;
        }

      }, () => {
        this.pConfig.system.logger.info(ErrorCodes.endpointResolutionError + ":" + ErrorDescription.endpointResolutionError);
        this.pCacheStorage.setItem(Constants.msalError, ErrorCodes.endpointResolutionError);
        this.pCacheStorage.setItem(Constants.msalErrorDescription, ErrorDescription.endpointResolutionError);
        if (reject) {
          reject(ErrorCodes.endpointResolutionError + Constants.resourceDelimeter + ErrorDescription.endpointResolutionError);
        }
        if (popUpWindow) {
          popUpWindow.close();
        }
      }).catch((err) => {
        this.pConfig.system.logger.warning("could not resolve endpoints");
        reject(err);
      });
    });
  }

  /** 
   * Used to get the token from cache.
   * MSAL will return the cached token if it is not expired.
   * Or it will send a request to the STS to obtain an access_token using a hidden iframe. To renew idToken, clientId should be passed as the only scope in the scopes array.
   * @param {Array<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token. Scopes like "openid" and "profile" are sent with every request.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://&lt;tenant&gt;/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://&lt;instance&gt;/tfp/&lt;tenant&gt;/<policyName>/
   * - Default value is: "https://login.microsoftonline.com/common"
   * @param {User} user - The user for which the scopes are requested.The default user is the logged in user.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the  authentication flow.
   * @returns {Promise.<string>} - A Promise that is fulfilled when this function has completed, or rejected if an error was raised. Resolved with token or rejected with error.
   */
  @resolveTokenOnlyIfOutOfIframe
  acquireTokenSilent(scopes: Array<string>, authority?: string, account?: Account, extraQueryParameters?: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const isValidScope = this.validateInputScope(scopes);
      if (isValidScope && !Utils.isEmpty(isValidScope)) {
        reject(ErrorCodes.inputScopesError + "|" + isValidScope);
        return null;
      } else {
        if (scopes) {
          scopes = this.filterScopes(scopes);
        }

        const scope = scopes.join(" ").toLowerCase();
        const accountObject = account ? account : this.getAccount();
        const adalIdToken = this.pCacheStorage.getItem(Constants.adalIdToken);
        //if user is not currently logged in and no login_hint/sid is passed as an extraQueryParamater
        if (!accountObject && Utils.checkSSO(extraQueryParameters) && Utils.isEmpty(adalIdToken)) {
          this.pConfig.system.logger.info("User login is required");
          reject(ErrorCodes.userLoginError + Constants.resourceDelimeter + ErrorDescription.userLoginError);
          return null;
        }
        //if user didn't passes the login_hint and adal's idtoken is present and no userobject, use the login_hint from adal's idToken
        else if (!accountObject && !Utils.isEmpty(adalIdToken)) {
          const idTokenObject = Utils.extractIdToken(adalIdToken);
          console.log("ADAL's idToken exists. Extracting login information from ADAL's idToken ");
          extraQueryParameters = Utils.constructUnifiedCacheExtraQueryParameter(idTokenObject, extraQueryParameters);
        }

        let authenticationRequest: AuthenticationRequestParameters;
        if (Utils.compareObjects(accountObject, this.getAccount())) {
          if (scopes.indexOf(this.pConfig.auth.clientId) > -1) {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
          else {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
          }
        } else {
          if (scopes.indexOf(this.pConfig.auth.clientId) > -1) {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
          else {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
        }

        const cacheResult = this.getCachedToken(authenticationRequest, accountObject);
        if (cacheResult) {
          if (cacheResult.token) {
            this.pConfig.system.logger.info("Token is already in cache for scope:" + scope);
            resolve(cacheResult.token);
            return null;
          }
          else if (cacheResult.errorDesc || cacheResult.error) {
            this.pConfig.system.logger.infoPii(cacheResult.errorDesc + ":" + cacheResult.error);
            reject(cacheResult.errorDesc + Constants.resourceDelimeter + cacheResult.error);
            return null;
          }
        }
        else {
          this.pConfig.system.logger.verbose("Token is not in cache for scope:" + scope);
        }

        if (!authenticationRequest.authorityInstance) {//Cache result can return null if cache is empty. In that case, set authority to default value if no authority is passed to the api.
          authenticationRequest.authorityInstance = authority ? AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority) : this.authorityInstance;
        }
        // cache miss
        return authenticationRequest.authorityInstance.ResolveEndpointsAsync()
          .then(() => {
            // refresh attept with iframe
            //Already renewing for this scope, callback when we get the token.
            if (window.activeRenewals[scope]) {
              this.pConfig.system.logger.verbose("Renew token for scope: " + scope + " is in progress. Registering callback");
              //Active renewals contains the state for each renewal.
              this.registerCallback(window.activeRenewals[scope], scope, resolve, reject);
            }
            else {
              if (scopes && scopes.indexOf(this.pConfig.auth.clientId) > -1 && scopes.length === 1) {
                // App uses idToken to send to api endpoints
                // Default scope is tracked as clientId to store this token
                this.pConfig.system.logger.verbose("renewing idToken");
                this.renewIdToken(scopes, resolve, reject, accountObject, authenticationRequest, extraQueryParameters);
              } else {
                this.pConfig.system.logger.verbose("renewing accesstoken");
                this.renewToken(scopes, resolve, reject, accountObject, authenticationRequest, extraQueryParameters);
              }
            }
          }).catch((err) => {
            this.pConfig.system.logger.warning("could not resolve endpoints");
            reject(err);
            return null;
          });
      }
    });
  }


  /** 
   * Used to get the token from cache.
   * 
   * TODO: extraQueryParams - refactor
   * 
   * MSAL will return the cached token if it is not expired.
   * Or it will send a request to the STS to obtain an access_token using a hidden iframe. To renew idToken, clientId should be passed as the only scope in the scopes array.
   * @param {Array<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token. Scopes like "openid" and "profile" are sent with every request.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://&lt;tenant&gt;/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://&lt;instance&gt;/tfp/&lt;tenant&gt;/<policyName>/
   * - Default value is: "https://login.microsoftonline.com/common"
   * @param {User} user - The user for which the scopes are requested.The default user is the logged in user.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the  authentication flow.
   * @returns {Promise.<string>} - A Promise that is fulfilled when this function has completed, or rejected if an error was raised. Resolved with token or rejected with error.
   */
  @resolveTokenOnlyIfOutOfIframe
  acquireTokenSilentNew(authParams: AuthenticationParameters): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const isValidScope = this.validateInputScope(authParams.scopes);
      if (isValidScope && !Utils.isEmpty(isValidScope)) {
        reject(ErrorCodes.inputScopesError + "|" + isValidScope);
        return null;
      } else {
        if (authParams.scopes) {
          authParams.scopes = this.filterScopes(authParams.scopes);
        }

        const scope = authParams.scopes.join(" ").toLowerCase();
        const accountObject = authParams.account ? authParams.account : this.getAccount();
        const adalIdToken = this.pCacheStorage.getItem(Constants.adalIdToken);
        let extraQueryParameters = Utils.constructExtraQueryParametersString(authParams.extraQueryParameters);


        //if user is not currently logged in and no login_hint/sid is passed as an extraQueryParamater
        // checkSSO code changes now that "sid" or "login_hint" can be sent as authentication parameters

        // if (!accountObject && Utils.checkSSO(extraQueryParameters) && Utils.isEmpty(adalIdToken)) {
        if (!accountObject && !(authParams.login_hint) && !(authParams.sid) && Utils.isEmpty(adalIdToken)) {
          this.pConfig.system.logger.info("User login is required");
          reject(ErrorCodes.userLoginError + Constants.resourceDelimeter + ErrorDescription.userLoginError);

          return null;
        }
        //if user didn't passes the login_hint and adal's idtoken is present and no userobject, use the login_hint from adal's idToken
        else if (!accountObject && !Utils.isEmpty(adalIdToken)) {
          const idTokenObject = Utils.extractIdToken(adalIdToken);
          console.log("ADAL's idToken exists. Extracting login information from ADAL's idToken ");
          extraQueryParameters = Utils.constructUnifiedCacheExtraQueryParameter(idTokenObject, extraQueryParameters);
        }

        let authenticationRequest: AuthenticationRequestParameters;
        if (Utils.compareObjects(accountObject, this.getAccount())) {
          if (authParams.scopes.indexOf(this.pConfig.auth.clientId) > -1) {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
          else {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
          }
        } else {
          if (authParams.scopes.indexOf(this.pConfig.auth.clientId) > -1) {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
          else {
            authenticationRequest = new AuthenticationRequestParameters(AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority), this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
          }
        }

        const cacheResult = this.getCachedToken(authenticationRequest, accountObject);
        if (cacheResult) {
          if (cacheResult.token) {
            this.pConfig.system.logger.info("Token is already in cache for scope:" + scope);
            resolve(cacheResult.token);
            return null;
          }
          else if (cacheResult.errorDesc || cacheResult.error) {
            this.pConfig.system.logger.infoPii(cacheResult.errorDesc + ":" + cacheResult.error);
            reject(cacheResult.errorDesc + Constants.resourceDelimeter + cacheResult.error);
            return null;
          }
        }
        else {
          this.pConfig.system.logger.verbose("Token is not in cache for scope:" + scope);
        }

        if (!authenticationRequest.authorityInstance) {//Cache result can return null if cache is empty. In that case, set authority to default value if no authority is passed to the api.
          authenticationRequest.authorityInstance = authParams.authority ? AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority) : this.authorityInstance;
        }
        // cache miss
        return authenticationRequest.authorityInstance.ResolveEndpointsAsync()
          .then(() => {
            // refresh attept with iframe
            //Already renewing for this scope, callback when we get the token.
            if (window.activeRenewals[scope]) {
              this.pConfig.system.logger.verbose("Renew token for scope: " + scope + " is in progress. Registering callback");
              //Active renewals contains the state for each renewal.
              this.registerCallback(window.activeRenewals[scope], scope, resolve, reject);
            }
            else {
              if (authParams.scopes && authParams.scopes.indexOf(this.pConfig.auth.clientId) > -1 && authParams.scopes.length === 1) {
                // App uses idToken to send to api endpoints
                // Default scope is tracked as clientId to store this token
                this.pConfig.system.logger.verbose("renewing idToken");
                this.renewIdToken(authParams.scopes, resolve, reject, accountObject, authenticationRequest, extraQueryParameters);
              } else {
                this.pConfig.system.logger.verbose("renewing accesstoken");
                this.renewToken(authParams.scopes, resolve, reject, accountObject, authenticationRequest, extraQueryParameters);
              }
            }
          }).catch((err) => {
            this.pConfig.system.logger.warning("could not resolve endpoints");
            reject(err);
            return null;
          });
      }
    });
  }

  /** 
   * Used to obtain an access_token by redirecting the user to the authorization endpoint.
   * To renew idToken, clientId should be passed as the only scope in the scopes array.
   * @param {Array<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token. Scopes like "openid" and "profile" are sent with every request.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://{instance}/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://{instance}/tfp/&lt;tenant&gt;/<policyName>
   * - Default value is: "https://login.microsoftonline.com/common"
   * @param {User} user - The user for which the scopes are requested.The default user is the logged in user.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the  authentication flow.
   */
  acquireTokenRedirect(scopes: Array<string>): void;
  acquireTokenRedirect(scopes: Array<string>, authority: string): void;
  acquireTokenRedirect(scopes: Array<string>, authority: string, account: Account): void;
  acquireTokenRedirect(scopes: Array<string>, authority: string, account: Account, extraQueryParameters: string): void;
  acquireTokenRedirect(scopes: Array<string>, authority?: string, account?: Account, extraQueryParameters?: string): void {
    const isValidScope = this.validateInputScope(scopes);
    if (isValidScope && !Utils.isEmpty(isValidScope)) {
      if (this.pTokenReceivedCallback) {
        this.pTokenReceivedCallback(ErrorDescription.inputScopesError, null, ErrorCodes.inputScopesError, Constants.accessToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
        return;
      }
    }

    if (scopes) {
      scopes = this.filterScopes(scopes);
    }

    const accountObject = account ? account : this.getAccount();
    if (this.pAcquireTokenInProgress) {
      return;
    }

    const scope = scopes.join(" ").toLowerCase();
    if (!accountObject && !(extraQueryParameters && (extraQueryParameters.indexOf(Constants.login_hint) !== -1))) {
      if (this.pTokenReceivedCallback) {
        this.pConfig.system.logger.info("User login is required");
        this.pTokenReceivedCallback(ErrorDescription.userLoginError, null, ErrorCodes.userLoginError, Constants.accessToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
        return;
      }
    }

    this.pAcquireTokenInProgress = true;
    let authenticationRequest: AuthenticationRequestParameters;
    let acquireTokenAuthority = authority ? AuthorityFactory.CreateInstance(authority, this.pConfig.auth.validateAuthority) : this.authorityInstance;

    acquireTokenAuthority.ResolveEndpointsAsync().then(() => {
      if (Utils.compareObjects(accountObject, this.getAccount())) {
        if (scopes.indexOf(this.pConfig.auth.clientId) > -1) {
          authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
        }
        else {
          authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
        }
      } else {
        authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
      }

      this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce, this.pConfig.cache.storeAuthStateInCookie);
      var acquireTokenUserKey;
      if (accountObject) {
        acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + accountObject.homeAccountIdentifier + Constants.resourceDelimeter + authenticationRequest.state;
      }
      else {
        acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + authenticationRequest.state;
      }

      this.pCacheStorage.setItem(acquireTokenUserKey, JSON.stringify(accountObject));
      const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
      this.pCacheStorage.setItem(authorityKey, acquireTokenAuthority.CanonicalAuthority, this.pConfig.cache.storeAuthStateInCookie);
      if (extraQueryParameters) {
        authenticationRequest.extraQueryParameters = extraQueryParameters;
      }

      let urlNavigate = authenticationRequest.createNavigateUrl(scopes) + Constants.response_mode_fragment;
      urlNavigate = this.addHintParameters(urlNavigate, accountObject);
      if (urlNavigate) {
        this.pCacheStorage.setItem(Constants.stateAcquireToken, authenticationRequest.state, this.pConfig.cache.storeAuthStateInCookie);
        window.location.replace(urlNavigate);
      }
    });
  }

  /** 
   * Used to obtain an access_token by redirecting the user to the authorization endpoint.
   * To renew idToken, clientId should be passed as the only scope in the scopes array.
   * @param {Array<string>} scopes - Permissions you want included in the access token. Not all scopes are  guaranteed to be included in the access token. Scopes like "openid" and "profile" are sent with every request.
   * @param {string} authority - A URL indicating a directory that MSAL can use to obtain tokens.
   * - In Azure AD, it is of the form https://{instance}/&lt;tenant&gt;, where &lt;tenant&gt; is the directory host (e.g. https://login.microsoftonline.com) and &lt;tenant&gt; is a identifier within the directory itself (e.g. a domain associated to the tenant, such as contoso.onmicrosoft.com, or the GUID representing the TenantID property of the directory)
   * - In Azure B2C, it is of the form https://{instance}/tfp/&lt;tenant&gt;/<policyName>
   * - Default value is: "https://login.microsoftonline.com/common"
   * @param {User} user - The user for which the scopes are requested.The default user is the logged in user.
   * @param {string} extraQueryParameters - Key-value pairs to pass to the STS during the  authentication flow.
   */
  
   acquireTokenRedirectNew(authParams: AuthenticationParameters): void {
    const isValidScope = this.validateInputScope(authParams.scopes);
    if (isValidScope && !Utils.isEmpty(isValidScope)) {
      if (this.pTokenReceivedCallback) {
        this.pTokenReceivedCallback(ErrorDescription.inputScopesError, null, ErrorCodes.inputScopesError, Constants.accessToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
        return;
      }
    }

    if (authParams.scopes) {
        authParams.scopes = this.filterScopes(authParams.scopes);
    }

    const accountObject = authParams.account ? authParams.account : this.getAccount();
    if (this.pAcquireTokenInProgress) {
      return;
    }

    const scope = authParams.scopes.join(" ").toLowerCase();
    let extraQueryParameters = Utils.constructExtraQueryParametersString(authParams.extraQueryParameters);

    // login_hint now is a part of AuthParams
    // if (!accountObject && !(extraQueryParameters && (extraQueryParameters.indexOf(Constants.login_hint) !== -1))) {
    if (!accountObject && !(authParams.login_hint)) {
      if (this.pTokenReceivedCallback) {
        this.pConfig.system.logger.info("User login is required");
        this.pTokenReceivedCallback(ErrorDescription.userLoginError, null, ErrorCodes.userLoginError, Constants.accessToken, this.getAccountState(this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie)));
        return;
      }
    }

    this.pAcquireTokenInProgress = true;
    let authenticationRequest: AuthenticationRequestParameters;
    let acquireTokenAuthority = authParams.authority ? AuthorityFactory.CreateInstance(authParams.authority, this.pConfig.auth.validateAuthority) : this.authorityInstance;

    acquireTokenAuthority.ResolveEndpointsAsync().then(() => {
      if (Utils.compareObjects(accountObject, this.getAccount())) {
        if (authParams.scopes.indexOf(this.pConfig.auth.clientId) > -1) {
          authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
        }
        else {
          authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
        }
      } else {
        authenticationRequest = new AuthenticationRequestParameters(acquireTokenAuthority, this.pConfig.auth.clientId, authParams.scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
      }

      this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce, this.pConfig.cache.storeAuthStateInCookie);
      var acquireTokenUserKey;
      if (accountObject) {
        acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + accountObject.homeAccountIdentifier + Constants.resourceDelimeter + authenticationRequest.state;
      }
      else {
        acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + authenticationRequest.state;
      }

      this.pCacheStorage.setItem(acquireTokenUserKey, JSON.stringify(accountObject));
      const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
      this.pCacheStorage.setItem(authorityKey, acquireTokenAuthority.CanonicalAuthority, this.pConfig.cache.storeAuthStateInCookie);
      if (extraQueryParameters) {
        authenticationRequest.extraQueryParameters = extraQueryParameters;
      }

      let urlNavigate = authenticationRequest.createNavigateUrl(authParams.scopes) + Constants.response_mode_fragment;
      urlNavigate = this.addHintParameters(urlNavigate, accountObject);
      if (urlNavigate) {
        this.pCacheStorage.setItem(Constants.stateAcquireToken, authenticationRequest.state, this.pConfig.cache.storeAuthStateInCookie);
        window.location.replace(urlNavigate);
      }
    });
  }

  /*
    * Used to redirect the browser to the STS authorization endpoint
    * @param {string} urlNavigate - URL of the authorization endpoint
    * @hidden
    */
  private promptUser(urlNavigate: string) {
    if (urlNavigate && !Utils.isEmpty(urlNavigate)) {
      this.pConfig.system.logger.infoPii("Navigate to:" + urlNavigate);
      window.location.replace(urlNavigate);
    } else {
      this.pConfig.system.logger.info("Navigate url is empty");
    }
  }

  /*
   * Used to send the user to the redirect_uri after authentication is complete. The user"s bearer token is attached to the URI fragment as an id_token/access_token field.
   * This function also closes the popup window after redirection.
   * @hidden
   * @ignore
   */
  private openWindow(urlNavigate: string, title: string, interval: number, instance: this, resolve?: Function, reject?: Function): Window {
    var popupWindow = this.openPopup(urlNavigate, title, Constants.popUpWidth, Constants.popUpHeight);
    if (popupWindow == null) {
      instance.pLoginInProgress = false;
      instance.pAcquireTokenInProgress = false;
      this.pConfig.system.logger.info(ErrorCodes.popUpWindowError + ":" + ErrorDescription.popUpWindowError);
      this.pCacheStorage.setItem(Constants.msalError, ErrorCodes.popUpWindowError);
      this.pCacheStorage.setItem(Constants.msalErrorDescription, ErrorDescription.popUpWindowError);
      if (reject) {
        reject(ErrorCodes.popUpWindowError + Constants.resourceDelimeter + ErrorDescription.popUpWindowError);
      }
      return null;
    }

    window.openedWindows.push(popupWindow);
    var pollTimer = window.setInterval(() => {
      if (popupWindow && popupWindow.closed && instance.pLoginInProgress) {
        if (reject) {
          reject(ErrorCodes.userCancelledError + Constants.resourceDelimeter + ErrorDescription.userCancelledError);
        }
        window.clearInterval(pollTimer);
        if (this.pConfig.framework.isAngular) {
          this.broadcast("msal:popUpClosed", ErrorCodes.userCancelledError + Constants.resourceDelimeter + ErrorDescription.userCancelledError);
          return;
        }
        instance.pLoginInProgress = false;
        instance.pAcquireTokenInProgress = false;
      }

      try {
        var popUpWindowLocation = popupWindow.location;
        if (popUpWindowLocation.href.indexOf(this.getRedirectUri()) !== -1) {
          window.clearInterval(pollTimer);
          instance.pLoginInProgress = false;
          instance.pAcquireTokenInProgress = false;
          this.pConfig.system.logger.info("Closing popup window");
          if (this.pConfig.framework.isAngular) {
            this.broadcast("msal:popUpHashChanged", popUpWindowLocation.hash);
            for (var i = 0; i < window.openedWindows.length; i++) {
              window.openedWindows[i].close();
            }
          }
        }
      } catch (e) {
        //Cross Domain url check error. Will be thrown until AAD redirects the user back to the app"s root page with the token. No need to log or throw this error as it will create unnecessary traffic.
      }
    },
      interval);

    return popupWindow;
  }

  private broadcast(eventName: string, data: string) {
    var evt = new CustomEvent(eventName, { detail: data });
    window.dispatchEvent(evt);
  }

  /*
   * Used to log out the current user, and redirect the user to the postLogoutRedirectUri.
   * Defaults behaviour is to redirect the user to `window.location.href`.
   */
  logout(): void {
    this.clearCache();
    this.pAccount = null;
    let logout = "";
    if (this.getPostLogoutRedirectUri()) {
      logout = "post_logout_redirect_uri=" + encodeURIComponent(this.getPostLogoutRedirectUri());
    }

    const urlNavigate = this.authority + "/oauth2/v2.0/logout?" + logout;
    this.promptUser(urlNavigate);
  }

  /*
   * Used to configure the popup window for login.
   * @ignore
   * @hidden
   */
  protected clearCache(): void {
    window.renewStates = [];
    const accessTokenItems = this.pCacheStorage.getAllAccessTokens(Constants.clientId, Constants.userIdentifier);
    for (let i = 0; i < accessTokenItems.length; i++) {
      this.pCacheStorage.removeItem(JSON.stringify(accessTokenItems[i].key));
    }
    this.pCacheStorage.resetCacheItems();
    this.pCacheStorage.clearCookie();
  }

  protected clearCacheForScope(accessToken: string) {
    const accessTokenItems = this.pCacheStorage.getAllAccessTokens(Constants.clientId, Constants.userIdentifier);
    for (var i = 0; i < accessTokenItems.length; i++) {
      var token = accessTokenItems[i];
      if (token.value.accessToken === accessToken) {
        this.pCacheStorage.removeItem(JSON.stringify(token.key));
      }
    }
  }


  /*
   * Configures popup window for login.
   * @ignore
   * @hidden
   */
  private openPopup(urlNavigate: string, title: string, popUpWidth: number, popUpHeight: number) {
    try {
      /*
       * adding winLeft and winTop to account for dual monitor
       * using screenLeft and screenTop for IE8 and earlier
       */
      const winLeft = window.screenLeft ? window.screenLeft : window.screenX;
      const winTop = window.screenTop ? window.screenTop : window.screenY;
      /*
       * window.innerWidth displays browser window"s height and width excluding toolbars
       * using document.documentElement.clientWidth for IE8 and earlier
       */
      const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
      const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
      const left = ((width / 2) - (popUpWidth / 2)) + winLeft;
      const top = ((height / 2) - (popUpHeight / 2)) + winTop;

      const popupWindow = window.open(urlNavigate, title, "width=" + popUpWidth + ", height=" + popUpHeight + ", top=" + top + ", left=" + left);
      if (popupWindow.focus) {
        popupWindow.focus();
      }

      return popupWindow;
    } catch (e) {
      this.pConfig.system.logger.error("error opening popup " + e.message);
      this.pLoginInProgress = false;
      this.pAcquireTokenInProgress = false;
      return null;
    }
  }

  /*
   * Used to validate the scopes input parameter requested  by the developer.
   * @param {Array<string>} scopes - Developer requested permissions. Not all scopes are guaranteed to be included in the access token returned.
   * @ignore
   * @hidden
   */
  private validateInputScope(scopes: Array<string>): string {
    if (!scopes || scopes.length < 1) {
      return "Scopes cannot be passed as an empty array";
    }

    if (!Array.isArray(scopes)) {
      throw new Error("API does not accept non-array scopes");
    }

    if (scopes.indexOf(this.pConfig.auth.clientId) > -1) {
      if (scopes.length > 1) {
        return "ClientId can only be provided as a single scope";
      }
    }
    return "";
  }

  /*
    * Used to remove openid and profile from the list of scopes passed by the developer.These scopes are added by default
    * @hidden
    */
  private filterScopes(scopes: Array<string>): Array<string> {
    scopes = scopes.filter(function (element) {
      return element !== "openid";
    });

    scopes = scopes.filter(function (element) {
      return element !== "profile";
    });

    return scopes;
  }

  /*
   * Used to add the developer requested callback to the array of callbacks for the specified scopes. The updated array is stored on the window object
   * @param {string} scope - Developer requested permissions. Not all scopes are guaranteed to be included in the access token returned.
   * @param {string} expectedState - Unique state identifier (guid).
   * @param {Function} resolve - The resolve function of the promise object.
   * @param {Function} reject - The reject function of the promise object.
   * @ignore
   * @hidden
   */
  private registerCallback(expectedState: string, scope: string, resolve: Function, reject: Function): void {
    window.activeRenewals[scope] = expectedState;
    if (!window.callBacksMappedToRenewStates[expectedState]) {
      window.callBacksMappedToRenewStates[expectedState] = [];
    }
    window.callBacksMappedToRenewStates[expectedState].push({ resolve: resolve, reject: reject });
    if (!window.callBackMappedToRenewStates[expectedState]) {
      window.callBackMappedToRenewStates[expectedState] =
        (errorDesc: string, token: string, error: string, tokenType: string) => {
          window.activeRenewals[scope] = null;
          for (let i = 0; i < window.callBacksMappedToRenewStates[expectedState].length; ++i) {
            try {
              if (errorDesc || error) {
                window.callBacksMappedToRenewStates[expectedState][i].reject(errorDesc + Constants.resourceDelimeter + error);
              }
              else if (token) {
                window.callBacksMappedToRenewStates[expectedState][i].resolve(token);
              }
            } catch (e) {
              this.pConfig.system.logger.warning(e);
            }
          }
          window.callBacksMappedToRenewStates[expectedState] = null;
          window.callBackMappedToRenewStates[expectedState] = null;
        };
    }
  }


  protected getCachedTokenInternal(scopes: Array<string>, account: Account): CacheResult {
    const userObject = account ? account : this.getAccount();
    if (!userObject) {
      return null;
    }
    let authenticationRequest: AuthenticationRequestParameters;
    let newAuthority = this.authorityInstance ? this.authorityInstance : AuthorityFactory.CreateInstance(this.authority, this.pConfig.auth.validateAuthority);

    if (Utils.compareObjects(userObject, this.getAccount())) {
      if (scopes.indexOf(this.pConfig.auth.clientId) > -1) {
        authenticationRequest = new AuthenticationRequestParameters(newAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token, this.getRedirectUri(), this.pConfig.auth.state);
      }
      else {
        authenticationRequest = new AuthenticationRequestParameters(newAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.token, this.getRedirectUri(), this.pConfig.auth.state);
      }
    } else {
      authenticationRequest = new AuthenticationRequestParameters(newAuthority, this.pConfig.auth.clientId, scopes, ResponseTypes.id_token_token, this.getRedirectUri(), this.pConfig.auth.state);
    }

    return this.getCachedToken(authenticationRequest, account);
  }

  /*
   * Used to get token for the specified set of scopes from the cache
   * @param {AuthenticationRequestParameters} authenticationRequest - Request sent to the STS to obtain an id_token/access_token
   * @param {User} user - User for which the scopes were requested
   * @hidden
   */
  private getCachedToken(authenticationRequest: AuthenticationRequestParameters, account: Account): CacheResult {
    let accessTokenCacheItem: AccessTokenCacheItem = null;
    const scopes = authenticationRequest.scopes;
    const tokenCacheItems = this.pCacheStorage.getAllAccessTokens(this.pConfig.auth.clientId, account ? account.homeAccountIdentifier : null); //filter by clientId and user
    if (tokenCacheItems.length === 0) { // No match found after initial filtering
      return null;
    }

    const filteredItems: Array<AccessTokenCacheItem> = [];
    //if no authority passed
    if (!authenticationRequest.authority) {
      //filter by scope
      for (let i = 0; i < tokenCacheItems.length; i++) {
        const cacheItem = tokenCacheItems[i];
        const cachedScopes = cacheItem.key.scopes.split(" ");
        if (Utils.containsScope(cachedScopes, scopes)) {
          filteredItems.push(cacheItem);
        }
      }

      //if only one cached token found
      if (filteredItems.length === 1) {
        accessTokenCacheItem = filteredItems[0];

        authenticationRequest.authorityInstance = AuthorityFactory.CreateInstance(accessTokenCacheItem.key.authority, this.pConfig.auth.validateAuthority);
      }
      else if (filteredItems.length > 1) {
        return {
          errorDesc: "The cache contains multiple tokens satisfying the requirements. Call AcquireToken again providing more requirements like authority",
          token: null,
          error: "multiple_matching_tokens_detected"
        };
      }
      else {
        //no match found. check if there was a single authority used
        const authorityList = this.getUniqueAuthority(tokenCacheItems, "authority");
        if (authorityList.length > 1) {
          return {
            errorDesc: "Multiple authorities found in the cache. Pass authority in the API overload.",
            token: null,
            error: "multiple_matching_tokens_detected"
          };
        }

        authenticationRequest.authorityInstance = AuthorityFactory.CreateInstance(authorityList[0], this.pConfig.auth.validateAuthority);
      }
    }
    else {
      //authority was passed in the API, filter by authority and scope
      for (let i = 0; i < tokenCacheItems.length; i++) {
        const cacheItem = tokenCacheItems[i];
        const cachedScopes = cacheItem.key.scopes.split(" ");
        if (Utils.containsScope(cachedScopes, scopes) && cacheItem.key.authority === authenticationRequest.authority) {
          filteredItems.push(cacheItem);
        }
      }

      //no match
      if (filteredItems.length === 0) {
        return null;
      }
      //only one cachedToken Found
      else if (filteredItems.length === 1) {
        accessTokenCacheItem = filteredItems[0];
      }
      else {
        //more than one match found.
        return {
          errorDesc: "The cache contains multiple tokens satisfying the requirements.Call AcquireToken again providing more requirements like authority",
          token: null,
          error: "multiple_matching_tokens_detected"
        };
      }
    }

    if (accessTokenCacheItem != null) {
      const expired = Number(accessTokenCacheItem.value.expiresIn);
      // If expiration is within offset, it will force renew
      const offset = this.pConfig.system.tokenRenewalOffsetSeconds || 300;
      if (expired && (expired > Utils.now() + offset)) {
        return {
          errorDesc: null,
          token: accessTokenCacheItem.value.accessToken,
          error: null
        };
      } else {
        this.pCacheStorage.removeItem(JSON.stringify(filteredItems[0].key));
        return null;
      }
    } else {
      return null;
    }
  }

  /*
   * Used to filter all cached items and return a list of unique users based on userIdentifier.
   * @param {Array<User>} Users - users saved in the cache.
   */
  getAllAccounts(): Array<Account> {
    const accounts: Array<Account> = [];
    const accessTokenCacheItems = this.pCacheStorage.getAllAccessTokens(Constants.clientId, Constants.userIdentifier);
    for (let i = 0; i < accessTokenCacheItems.length; i++) {
      const idToken = new IdToken(accessTokenCacheItems[i].value.idToken);
      const clientInfo = new HomeAccountIdentifier(accessTokenCacheItems[i].value.clientInfo);
      const account = Account.createAccount(idToken, clientInfo);
      accounts.push(account);
    }

    return this.getUniqueAccounts(accounts);
  }

  /*
   * Used to filter users based on userIdentifier
   * @param {Array<User>}  Users - users saved in the cache
   * @ignore
   * @hidden
   */
  private getUniqueAccounts(accounts: Array<Account>): Array<Account> {
    if (!accounts || accounts.length <= 1) {
      return accounts;
    }

    const flags: Array<string> = [];
    const uniqueUsers: Array<Account> = [];
    for (let index = 0; index < accounts.length; ++index) {
      if (accounts[index].homeAccountIdentifier && flags.indexOf(accounts[index].homeAccountIdentifier) === -1) {
        flags.push(accounts[index].homeAccountIdentifier);
        uniqueUsers.push(accounts[index]);
      }
    }

    return uniqueUsers;
  }

  /*
  * Used to get a unique list of authoritues from the cache
  * @param {Array<AccessTokenCacheItem>}  accessTokenCacheItems - accessTokenCacheItems saved in the cache
  * @ignore
  * @hidden
  */
  private getUniqueAuthority(accessTokenCacheItems: Array<AccessTokenCacheItem>, property: string): Array<string> {
    const authorityList: Array<string> = [];
    const flags: Array<string> = [];
    accessTokenCacheItems.forEach(element => {
      if (element.key.hasOwnProperty(property) && (flags.indexOf(element.key[property]) === -1)) {
        flags.push(element.key[property]);
        authorityList.push(element.key[property]);
      }
    });
    return authorityList;
  }

  /*
   * Adds login_hint to authorization URL which is used to pre-fill the username field of sign in page for the user if known ahead of time
   * domain_hint can be one of users/organisations which when added skips the email based discovery process of the user
   * domain_req utid received as part of the clientInfo
   * login_req uid received as part of clientInfo
   * @param {string} urlNavigate - Authentication request url
   * @param {User} user - User for which the token is requested
   * @ignore
   * @hidden
   */
  private addHintParameters(urlNavigate: string, account: Account): string {
    const accountObj = account ? account : this.getAccount();
    if (accountObj) {
      const decodedClientInfo = accountObj.homeAccountIdentifier.split(".");
      const uid = Utils.base64DecodeStringUrlSafe(decodedClientInfo[0]);
      const utid = Utils.base64DecodeStringUrlSafe(decodedClientInfo[1]);

      if (accountObj.sid && urlNavigate.indexOf(Constants.prompt_none) !== -1) {
        if (!this.urlContainsQueryStringParameter(Constants.sid, urlNavigate) && !this.urlContainsQueryStringParameter(Constants.login_hint, urlNavigate)) {
          urlNavigate += "&" + Constants.sid + "=" + encodeURIComponent(accountObj.sid);
        }
      }
      else {
        if (!this.urlContainsQueryStringParameter(Constants.login_hint, urlNavigate) && accountObj.userName && !Utils.isEmpty(accountObj.userName)) {
          urlNavigate += "&" + Constants.login_hint + "=" + encodeURIComponent(accountObj.userName);
        }
      }

      if (!Utils.isEmpty(uid) && !Utils.isEmpty(utid)) {
        if (!this.urlContainsQueryStringParameter("domain_req", urlNavigate) && !Utils.isEmpty(utid)) {
          urlNavigate += "&domain_req=" + encodeURIComponent(utid);
        }

        if (!this.urlContainsQueryStringParameter("login_req", urlNavigate) && !Utils.isEmpty(uid)) {
          urlNavigate += "&login_req=" + encodeURIComponent(uid);
        }
      }
      if (!this.urlContainsQueryStringParameter(Constants.domain_hint, urlNavigate) && !Utils.isEmpty(utid)) {
        if (utid === Constants.consumersUtid) {
          urlNavigate += "&" + Constants.domain_hint + "=" + encodeURIComponent(Constants.consumers);
        } else {
          urlNavigate += "&" + Constants.domain_hint + "=" + encodeURIComponent(Constants.organizations);
        }
      }

    }

    return urlNavigate;
  }

  /*
   * Checks if the authorization endpoint URL contains query string parameters
   * @ignore
   * @hidden
   */
  private urlContainsQueryStringParameter(name: string, url: string): boolean {
    // regex to detect pattern of a ? or & followed by the name parameter and an equals character
    const regex = new RegExp("[\\?&]" + name + "=");
    return regex.test(url);
  }

  
  private extractADALIdToken(): any {
    const adalIdToken = this.pCacheStorage.getItem(Constants.adalIdToken);
    if (!Utils.isEmpty(adalIdToken)) {
      return Utils.extractIdToken(adalIdToken);
    }
    return null;
  }

  /*
   * Calling _loadFrame but with a timeout to signal failure in loadframeStatus. Callbacks are left.
   * registered when network errors occur and subsequent token requests for same resource are registered to the pending request.
   * @ignore
   * @hidden
   */
  private loadIframeTimeout(urlNavigate: string, frameName: string, scope: string): void {
    //set iframe session to pending
    const expectedState = window.activeRenewals[scope];
    this.pConfig.system.logger.verbose("Set loading state to pending for: " + scope + ":" + expectedState);
    this.pCacheStorage.setItem(Constants.renewStatus + expectedState, Constants.tokenRenewStatusInProgress);
    this.loadFrame(urlNavigate, frameName);
    setTimeout(() => {
      if (this.pCacheStorage.getItem(Constants.renewStatus + expectedState) === Constants.tokenRenewStatusInProgress) {
        // fail the iframe session if it"s in pending state
        this.pConfig.system.logger.verbose("Loading frame has timed out after: " + (this.pConfig.system.loadFrameTimeout / 1000) + " seconds for scope " + scope + ":" + expectedState);
        if (expectedState && window.callBackMappedToRenewStates[expectedState]) {
          window.callBackMappedToRenewStates[expectedState]("Token renewal operation failed due to timeout", null, "Token Renewal Failed", Constants.accessToken);
        }

        this.pCacheStorage.setItem(Constants.renewStatus + expectedState, Constants.tokenRenewStatusCancelled);
      }
    }, this.pConfig.system.loadFrameTimeout);
  }

  /*
   * Loads iframe with authorization endpoint URL
   * @ignore
   * @hidden
   */
  private loadFrame(urlNavigate: string, frameName: string): void {
    // This trick overcomes iframe navigation in IE
    // IE does not load the page consistently in iframe
    this.pConfig.system.logger.info("LoadFrame: " + frameName);
    var frameCheck = frameName;
    setTimeout(() => {
      var frameHandle = this.addAdalFrame(frameCheck);
      if (frameHandle.src === "" || frameHandle.src === "about:blank") {
        frameHandle.src = urlNavigate;
        this.pConfig.system.logger.infoPii("Frame Name : " + frameName + " Navigated to: " + urlNavigate);
      }
    },
      500);
  }

  /*
   * Adds the hidden iframe for silent token renewal.
   * @ignore
   * @hidden
   */
  private addAdalFrame(iframeId: string): HTMLIFrameElement {
    if (typeof iframeId === "undefined") {
      return null;
    }

    this.pConfig.system.logger.info("Add msal frame to document:" + iframeId);
    let adalFrame = document.getElementById(iframeId) as HTMLIFrameElement;
    if (!adalFrame) {
      if (document.createElement &&
        document.documentElement &&
        (window.navigator.userAgent.indexOf("MSIE 5.0") === -1)) {
        const ifr = document.createElement("iframe");
        ifr.setAttribute("id", iframeId);
        ifr.style.visibility = "hidden";
        ifr.style.position = "absolute";
        ifr.style.width = ifr.style.height = "0";
        ifr.style.border = "0";
        adalFrame = (document.getElementsByTagName("body")[0].appendChild(ifr) as HTMLIFrameElement);
      } else if (document.body && document.body.insertAdjacentHTML) {
        document.body.insertAdjacentHTML("beforeend", "<iframe name='" + iframeId + "' id='" + iframeId + "' style='display:none'></iframe>");
      }

      if (window.frames && window.frames[iframeId]) {
        adalFrame = window.frames[iframeId];
      }
    }

    return adalFrame;
  }

  /*
   * Acquires access token using a hidden iframe.
   * @ignore
   * @hidden
   */
  private renewToken(scopes: Array<string>, resolve: Function, reject: Function, account: Account, authenticationRequest: AuthenticationRequestParameters, extraQueryParameters?: string): void {
    const scope = scopes.join(" ").toLowerCase();
    this.pConfig.system.logger.verbose("renewToken is called for scope:" + scope);
    const frameHandle = this.addAdalFrame("msalRenewFrame" + scope);
    if (extraQueryParameters) {
      authenticationRequest.extraQueryParameters = extraQueryParameters;
    }

    var acquireTokenUserKey;
    if (account) {
      acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + account.homeAccountIdentifier + Constants.resourceDelimeter + authenticationRequest.state;
    }
    else {
      acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + authenticationRequest.state;
    }

    this.pCacheStorage.setItem(acquireTokenUserKey, JSON.stringify(account));
    const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
    this.pCacheStorage.setItem(authorityKey, authenticationRequest.authority);
    // renew happens in iframe, so it keeps javascript context
    this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce);
    this.pConfig.system.logger.verbose("Renew token Expected state: " + authenticationRequest.state);
    let urlNavigate = Utils.urlRemoveQueryStringParameter(authenticationRequest.createNavigateUrl(scopes), Constants.prompt) + Constants.prompt_none;
    urlNavigate = this.addHintParameters(urlNavigate, account);
    window.renewStates.push(authenticationRequest.state);
    window.requestType = Constants.renewToken;
    this.registerCallback(authenticationRequest.state, scope, resolve, reject);
    this.pConfig.system.logger.infoPii("Navigate to:" + urlNavigate);
    frameHandle.src = "about:blank";
    this.loadIframeTimeout(urlNavigate, "msalRenewFrame" + scope, scope);
  }

  /*
   * Renews idtoken for app"s own backend when clientId is passed as a single scope in the scopes array.
   * @ignore
   * @hidden
   */
  private renewIdToken(scopes: Array<string>, resolve: Function, reject: Function, account: Account, authenticationRequest: AuthenticationRequestParameters, extraQueryParameters?: string): void {
    const scope = scopes.join(" ").toLowerCase();
    this.pConfig.system.logger.info("renewidToken is called");
    const frameHandle = this.addAdalFrame("msalIdTokenFrame");
    if (extraQueryParameters) {
      authenticationRequest.extraQueryParameters = extraQueryParameters;
    }

    var acquireTokenUserKey;
    if (account) {
      acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + account.homeAccountIdentifier + Constants.resourceDelimeter + authenticationRequest.state;
    }
    else {
      acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + authenticationRequest.state;
    }
    this.pCacheStorage.setItem(acquireTokenUserKey, JSON.stringify(account));
    const authorityKey = Constants.authority + Constants.resourceDelimeter + authenticationRequest.state;
    this.pCacheStorage.setItem(authorityKey, authenticationRequest.authority);
    this.pCacheStorage.setItem(Constants.nonceIdToken, authenticationRequest.nonce);
    this.pConfig.system.logger.verbose("Renew Idtoken Expected state: " + authenticationRequest.state);
    let urlNavigate = Utils.urlRemoveQueryStringParameter(authenticationRequest.createNavigateUrl(scopes), Constants.prompt) + Constants.prompt_none;
    urlNavigate = this.addHintParameters(urlNavigate, account);
    if (this.pSilentLogin) {
      window.requestType = Constants.login;
      this.pSilentAuthenticationState = authenticationRequest.state;
    } else {
      window.requestType = Constants.renewToken;
      window.renewStates.push(authenticationRequest.state);
    }

    this.registerCallback(authenticationRequest.state, this.pConfig.auth.clientId, resolve, reject);
    this.pConfig.system.logger.infoPii("Navigate to:" + urlNavigate);
    frameHandle.src = "about:blank";
    this.loadIframeTimeout(urlNavigate, "msalIdTokenFrame", this.pConfig.auth.clientId);
  }

  /*
    * Returns the signed in user (received from a user object created at the time of login) or null.
    */
  getAccount(): Account {
    // idToken is first call
    if (this.pAccount) {
      return this.pAccount;
    }

    // frame is used to get idToken
    const rawIdToken = this.pCacheStorage.getItem(Constants.idTokenKey);
    const rawClientInfo = this.pCacheStorage.getItem(Constants.msalClientInfo);
    if (!Utils.isEmpty(rawIdToken) && !Utils.isEmpty(rawClientInfo)) {
      const idToken = new IdToken(rawIdToken);
      const clientInfo = new HomeAccountIdentifier(rawClientInfo);
      this.pAccount = Account.createAccount(idToken, clientInfo);
      return this.pAccount;
    }

    return null;
  }

  /*
   * This method must be called for processing the response received from the STS. It extracts the hash, processes the token or error information and saves it in the cache. It then
   * calls the registered callbacks in case of redirect or resolves the promises with the result.
   * @param {string} [hash=window.location.hash] - Hash fragment of Url.
   * @hidden
   */
  private handleAuthenticationResponse(hash: string): void {
    if (hash == null) {
      hash = window.location.hash;
    }

    var self = null;
    var isPopup: boolean = false;
    var isWindowOpenerMsal = false;

    try {
      isWindowOpenerMsal = window.opener && window.opener.msal && window.opener.msal !== window.msal;
    } catch (err) {
      // err = SecurityError: Blocked a frame with origin "[url]" from accessing a cross-origin frame.
      isWindowOpenerMsal = false;
    }

    if (isWindowOpenerMsal) {
      self = window.opener.msal;
      isPopup = true;
    }
    else if (window.parent && window.parent.msal) {
      self = window.parent.msal;
    }

    const requestInfo = self.getRequestInfo(hash); //if(window.parent!==window), by using self, window.parent becomes equal to window in getRequestInfo method specifically
    let token: string = null, tokenReceivedCallback: (errorDesc: string, token: string, error: string, tokenType: string) => void = null, tokenType: string, saveToken: boolean = true;
    self.pLogger.info("Returned from redirect url");
    if (window.parent !== window && window.parent.msal) {
      tokenReceivedCallback = window.parent.callBackMappedToRenewStates[requestInfo.stateResponse];
    }
    else if (isWindowOpenerMsal) {
      tokenReceivedCallback = window.opener.callBackMappedToRenewStates[requestInfo.stateResponse];
    }
    else {
      if (self._navigateToLoginRequestUrl) {
        tokenReceivedCallback = null;
        self.pCacheStorage.setItem(Constants.urlHash, hash);
        saveToken = false;
        if (window.parent === window && !isPopup) {
          window.location.href = self.pCacheStorage.getItem(Constants.loginRequest, this.pConfig.cache.storeAuthStateInCookie);
        }
        return;
      }
      else {
        tokenReceivedCallback = self.pTokenReceivedCallback;
        window.location.hash = "";
      }

    }

    self.saveTokenFromHash(requestInfo);

    if ((requestInfo.requestType === Constants.renewToken) && window.parent) {
      if (window.parent !== window) {
        self.pLogger.verbose("Window is in iframe, acquiring token silently");
      } else {
        self.pLogger.verbose("acquiring token interactive in progress");
      }

      token = requestInfo.parameters[Constants.accessToken] || requestInfo.parameters[Constants.idToken];
      tokenType = Constants.accessToken;
    } else if (requestInfo.requestType === Constants.login) {
      token = requestInfo.parameters[Constants.idToken];
      tokenType = Constants.idToken;
    }

    var errorDesc = requestInfo.parameters[Constants.errorDescription];
    var error = requestInfo.parameters[Constants.error];
    try {
      if (tokenReceivedCallback) {
        //We should only send the stae back to the developer if it matches with what we received from the server
        if (requestInfo.stateMatch) {
          tokenReceivedCallback.call(self, errorDesc, token, error, tokenType, this.getAccountState(requestInfo.stateResponse));
        }
        else {
          tokenReceivedCallback.call(self, errorDesc, token, error, tokenType, null);
        }
      }

    } catch (err) {
      self.pLogger.error("Error occurred in token received callback function: " + err);
    }
    if (isWindowOpenerMsal) {
      for (var i = 0; i < window.opener.openedWindows.length; i++) {
        window.opener.openedWindows[i].close();
      }
    }
  }

  /*
   * This method must be called for processing the response received from AAD. It extracts the hash, processes the token or error, saves it in the cache and calls the registered callbacks with the result.
   * @param {string} authority authority received in the redirect response from AAD.
   * @param {TokenResponse} requestInfo an object created from the redirect response from AAD comprising of the keys - parameters, requestType, stateMatch, stateResponse and valid.
   * @param {User} user user object for which scopes are consented for. The default user is the logged in user.
   * @param {ClientInfo} clientInfo clientInfo received as part of the response comprising of fields uid and utid.
   * @param {IdToken} idToken idToken received as part of the response.
   * @ignore
   * @private
   * @hidden
   */
  /* tslint:disable:no-string-literal */
  private saveAccessToken(authority: string, tokenResponse: TokenResponse, account: Account, clientInfo: string, idToken: IdToken): void {
    let scope: string;
    let clientObj: HomeAccountIdentifier = new HomeAccountIdentifier(clientInfo);
    if (tokenResponse.parameters.hasOwnProperty("scope")) {
      scope = tokenResponse.parameters["scope"];
      const consentedScopes = scope.split(" ");
      const accessTokenCacheItems =
        this.pCacheStorage.getAllAccessTokens(this.pConfig.auth.clientId, authority);
      for (let i = 0; i < accessTokenCacheItems.length; i++) {
        const accessTokenCacheItem = accessTokenCacheItems[i];
        // TODO" Check where to change this
        if (accessTokenCacheItem.key.userIdentifier === account.homeAccountIdentifier) {
          const cachedScopes = accessTokenCacheItem.key.scopes.split(" ");
          if (Utils.isIntersectingScopes(cachedScopes, consentedScopes)) {
            this.pCacheStorage.removeItem(JSON.stringify(accessTokenCacheItem.key));
          }
        }
      }
      const accessTokenKey = new AccessTokenKey(authority, this.pConfig.auth.clientId, scope, clientObj.uid, clientObj.utid);
      const accessTokenValue = new AccessTokenValue(tokenResponse.parameters[Constants.accessToken], idToken.rawIdToken, Utils.expiresIn(tokenResponse.parameters[Constants.expiresIn]).toString(), clientInfo);
      this.pCacheStorage.setItem(JSON.stringify(accessTokenKey), JSON.stringify(accessTokenValue));
    } else {
      scope = this.pConfig.auth.clientId;
      const accessTokenKey = new AccessTokenKey(authority, this.pConfig.auth.clientId, scope, clientObj.uid, clientObj.utid);
      const accessTokenValue = new AccessTokenValue(tokenResponse.parameters[Constants.idToken], tokenResponse.parameters[Constants.idToken], idToken.expiration, clientInfo);
      this.pCacheStorage.setItem(JSON.stringify(accessTokenKey), JSON.stringify(accessTokenValue));
    }
  }

  /*
   * Saves token or error received in the response from AAD in the cache. In case of id_token, it also creates the user object.
   * @ignore
   * @hidden
   */
  protected saveTokenFromHash(tokenResponse: TokenResponse): void {
    this.pConfig.system.logger.info("State status:" + tokenResponse.stateMatch + "; Request type:" + tokenResponse.requestType);
    this.pCacheStorage.setItem(Constants.msalError, "");
    this.pCacheStorage.setItem(Constants.msalErrorDescription, "");
    var scope: string = "";
    var authorityKey: string = "";
    var acquireTokenUserKey: string = "";
    if (tokenResponse.parameters.hasOwnProperty("scope")) {
      scope = tokenResponse.parameters["scope"].toLowerCase();
    }
    else {
      scope = this.pConfig.auth.clientId;
    }

    // Record error
    if (tokenResponse.parameters.hasOwnProperty(Constants.errorDescription) || tokenResponse.parameters.hasOwnProperty(Constants.error)) {
      this.pConfig.system.logger.infoPii("Error :" + tokenResponse.parameters[Constants.error] + "; Error description:" + tokenResponse.parameters[Constants.errorDescription]);
      this.pCacheStorage.setItem(Constants.msalError, tokenResponse.parameters["error"]);
      this.pCacheStorage.setItem(Constants.msalErrorDescription, tokenResponse.parameters[Constants.errorDescription]);
      if (tokenResponse.requestType === Constants.login) {
        this.pLoginInProgress = false;
        this.pCacheStorage.setItem(Constants.loginError, tokenResponse.parameters[Constants.errorDescription] + ":" + tokenResponse.parameters[Constants.error]);
        authorityKey = Constants.authority + Constants.resourceDelimeter + tokenResponse.stateResponse;
      }

      if (tokenResponse.requestType === Constants.renewToken) {
        this.pAcquireTokenInProgress = false;
        authorityKey = Constants.authority + Constants.resourceDelimeter + tokenResponse.stateResponse;
        var userKey = this.getAccount() !== null ? this.getAccount().homeAccountIdentifier : "";
        acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + userKey + Constants.resourceDelimeter + tokenResponse.stateResponse;
      }

    } else {
      // It must verify the state from redirect
      if (tokenResponse.stateMatch) {
        // record tokens to storage if exists
        this.pConfig.system.logger.info("State is right");
        if (tokenResponse.parameters.hasOwnProperty(Constants.sessionState)) {
          this.pCacheStorage.setItem(Constants.msalSessionState, tokenResponse.parameters[Constants.sessionState]);
        }
        var idToken: IdToken;
        var clientInfo: string = "";
        if (tokenResponse.parameters.hasOwnProperty(Constants.accessToken)) {
          this.pConfig.system.logger.info("Fragment has access token");
          this.pAcquireTokenInProgress = false;
          let account: Account;
          if (tokenResponse.parameters.hasOwnProperty(Constants.idToken)) {
            idToken = new IdToken(tokenResponse.parameters[Constants.idToken]);
          } else {
            idToken = new IdToken(this.pCacheStorage.getItem(Constants.idTokenKey));
          }

          authorityKey = Constants.authority + Constants.resourceDelimeter + tokenResponse.stateResponse;
          let authority: string = this.pCacheStorage.getItem(authorityKey, this.pConfig.cache.storeAuthStateInCookie);
          if (!Utils.isEmpty(authority)) {
            authority = Utils.replaceFirstPath(authority, idToken.tenantId);
          }

          if (tokenResponse.parameters.hasOwnProperty(Constants.clientInfo)) {
            clientInfo = tokenResponse.parameters[Constants.clientInfo];
            account = Account.createAccount(idToken, new HomeAccountIdentifier(clientInfo));
          } else {
            this.pConfig.system.logger.warning("ClientInfo not received in the response from AAD");
            account = Account.createAccount(idToken, new HomeAccountIdentifier(clientInfo));
          }

          acquireTokenUserKey = Constants.acquireTokenUser + Constants.resourceDelimeter + account.homeAccountIdentifier + Constants.resourceDelimeter + tokenResponse.stateResponse;
          var acquireTokenUserKey_nouser = Constants.acquireTokenUser + Constants.resourceDelimeter + Constants.no_account + Constants.resourceDelimeter + tokenResponse.stateResponse;
          let cachedUser: string = this.pCacheStorage.getItem(acquireTokenUserKey);
          let acquireTokenUser: Account;
          if (!Utils.isEmpty(cachedUser)) {
            acquireTokenUser = JSON.parse(cachedUser);
            if (account && acquireTokenUser && Utils.compareObjects(account, acquireTokenUser)) {
              this.saveAccessToken(authority, tokenResponse, account, clientInfo, idToken);
              this.pConfig.system.logger.info(
                "The user object received in the response is the same as the one passed in the acquireToken request");
            } else {
              this.pConfig.system.logger.warning(
                "The user object created from the response is not the same as the one passed in the acquireToken request");
            }
          }
          else if (!Utils.isEmpty(this.pCacheStorage.getItem(acquireTokenUserKey_nouser))) {
            this.saveAccessToken(authority, tokenResponse, account, clientInfo, idToken);
          }
        }

        if (tokenResponse.parameters.hasOwnProperty(Constants.idToken)) {
          this.pConfig.system.logger.info("Fragment has id token");
          this.pLoginInProgress = false;
          idToken = new IdToken(tokenResponse.parameters[Constants.idToken]);
          if (tokenResponse.parameters.hasOwnProperty(Constants.clientInfo)) {
            clientInfo = tokenResponse.parameters[Constants.clientInfo];
          } else {
            this.pConfig.system.logger.warning("ClientInfo not received in the response from AAD");
          }

          authorityKey = Constants.authority + Constants.resourceDelimeter + tokenResponse.stateResponse;
          let authority: string = this.pCacheStorage.getItem(authorityKey, this.pConfig.cache.storeAuthStateInCookie);
          if (!Utils.isEmpty(authority)) {
            authority = Utils.replaceFirstPath(authority, idToken.tenantId);
          }

          this.pAccount = Account.createAccount(idToken, new HomeAccountIdentifier(clientInfo));
          if (idToken && idToken.nonce) {
            if (idToken.nonce !== this.pCacheStorage.getItem(Constants.nonceIdToken, this.pConfig.cache.storeAuthStateInCookie)) {
              this.pAccount = null;
              this.pCacheStorage.setItem(Constants.loginError, "Nonce Mismatch. Expected Nonce: " + this.pCacheStorage.getItem(Constants.nonceIdToken, this.pConfig.cache.storeAuthStateInCookie) + "," + "Actual Nonce: " + idToken.nonce);
              this.pConfig.system.logger.error("Nonce Mismatch.Expected Nonce: " + this.pCacheStorage.getItem(Constants.nonceIdToken, this.pConfig.cache.storeAuthStateInCookie) + "," + "Actual Nonce: " + idToken.nonce);
            } else {
              this.pCacheStorage.setItem(Constants.idTokenKey, tokenResponse.parameters[Constants.idToken]);
              this.pCacheStorage.setItem(Constants.msalClientInfo, clientInfo);

              // Save idToken as access token for app itself
              this.saveAccessToken(authority, tokenResponse, this.pAccount, clientInfo, idToken);
            }
          } else {
            authorityKey = tokenResponse.stateResponse;
            acquireTokenUserKey = tokenResponse.stateResponse;
            this.pConfig.system.logger.error("Invalid id_token received in the response");
            tokenResponse.parameters["error"] = "invalid idToken";
            tokenResponse.parameters["error_description"] = "Invalid idToken. idToken: " + tokenResponse.parameters[Constants.idToken];
            this.pCacheStorage.setItem(Constants.msalError, "invalid idToken");
            this.pCacheStorage.setItem(Constants.msalErrorDescription, "Invalid idToken. idToken: " + tokenResponse.parameters[Constants.idToken]);
          }
        }
      } else {
        authorityKey = tokenResponse.stateResponse;
        acquireTokenUserKey = tokenResponse.stateResponse;
        this.pConfig.system.logger.error("State Mismatch.Expected State: " + this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie) + "," + "Actual State: " + tokenResponse.stateResponse);
        tokenResponse.parameters["error"] = "Invalid_state";
        tokenResponse.parameters["error_description"] = "Invalid_state. state: " + tokenResponse.stateResponse;
        this.pCacheStorage.setItem(Constants.msalError, "Invalid_state");
        this.pCacheStorage.setItem(Constants.msalErrorDescription, "Invalid_state. state: " + tokenResponse.stateResponse);
      }
    }
    this.pCacheStorage.setItem(Constants.renewStatus + tokenResponse.stateResponse, Constants.tokenRenewStatusCompleted);
    this.pCacheStorage.removeAcquireTokenEntries(authorityKey, acquireTokenUserKey);
    //this is required if navigateToLoginRequestUrl=false
    if (this.pConfig.cache.storeAuthStateInCookie) {
      this.pCacheStorage.setItemCookie(authorityKey, "", -1);
      this.pCacheStorage.clearCookie();
    }
  }
  /* tslint:enable:no-string-literal */

  /*
   * Checks if the redirect response is received from the STS. In case of redirect, the url fragment has either id_token, access_token or error.
   * @param {string} hash - Hash passed from redirect page.
   * @returns {Boolean} - true if response contains id_token, access_token or error, false otherwise.
   * @hidden
   */
  isCallback(hash: string): boolean {
    hash = this.getHash(hash);
    const parameters = Utils.deserialize(hash);
    return (
      parameters.hasOwnProperty(Constants.errorDescription) ||
      parameters.hasOwnProperty(Constants.error) ||
      parameters.hasOwnProperty(Constants.accessToken) ||
      parameters.hasOwnProperty(Constants.idToken)

    );
  }

  /*
   * Returns the anchor part(#) of the URL
   * @ignore
   * @hidden
   */
  private getHash(hash: string): string {
    if (hash.indexOf("#/") > -1) {
      hash = hash.substring(hash.indexOf("#/") + 2);
    } else if (hash.indexOf("#") > -1) {
      hash = hash.substring(1);
    }

    return hash;
  }

  /*
    * Creates a requestInfo object from the URL fragment and returns it.
    * @param {string} hash  -  Hash passed from redirect page
    * @returns {TokenResponse} an object created from the redirect response from AAD comprising of the keys - parameters, requestType, stateMatch, stateResponse and valid.
    * @ignore
    * @hidden
    */
  protected getRequestInfo(hash: string): TokenResponse {
    hash = this.getHash(hash);
    const parameters = Utils.deserialize(hash);
    const tokenResponse = new TokenResponse();
    if (parameters) {
      tokenResponse.parameters = parameters;
      if (parameters.hasOwnProperty(Constants.errorDescription) ||
        parameters.hasOwnProperty(Constants.error) ||
        parameters.hasOwnProperty(Constants.accessToken) ||
        parameters.hasOwnProperty(Constants.idToken)) {
        tokenResponse.valid = true;
        // which call
        let stateResponse: string;
        if (parameters.hasOwnProperty("state")) {
          stateResponse = parameters.state;
        } else {
          return tokenResponse;
        }

        tokenResponse.stateResponse = stateResponse;
        // async calls can fire iframe and login request at the same time if developer does not use the API as expected
        // incoming callback needs to be looked up to find the request type
        if (stateResponse === this.pCacheStorage.getItem(Constants.stateLogin, this.pConfig.cache.storeAuthStateInCookie) || stateResponse === this.pSilentAuthenticationState) { // loginRedirect
          tokenResponse.requestType = Constants.login;
          tokenResponse.stateMatch = true;
          return tokenResponse;
        } else if (stateResponse === this.pCacheStorage.getItem(Constants.stateAcquireToken, this.pConfig.cache.storeAuthStateInCookie)) { //acquireTokenRedirect
          tokenResponse.requestType = Constants.renewToken;
          tokenResponse.stateMatch = true;
          return tokenResponse;
        }

        // external api requests may have many renewtoken requests for different resource
        if (!tokenResponse.stateMatch) {
          tokenResponse.requestType = window.requestType;
          const statesInParentContext = window.renewStates;
          for (let i = 0; i < statesInParentContext.length; i++) {
            if (statesInParentContext[i] === tokenResponse.stateResponse) {
              tokenResponse.stateMatch = true;
              break;
            }
          }
        }
      }
    }
    return tokenResponse;
  }

  /*
    * Extracts scope value from the state sent with the authentication request.
    * @returns {string} scope.
    * @ignore
    * @hidden
    */
  private getScopeFromState(state: string): string {
    if (state) {
      const splitIndex = state.indexOf("|");
      if (splitIndex > -1 && splitIndex + 1 < state.length) {
        return state.substring(splitIndex + 1);
      }
    }
    return "";
  }

  /*
  * Extracts state value from the userState sent with the authentication request.
  * @returns {string} scope.
  * @ignore
  * @hidden
  */
  getAccountState(state: string) {
    if (state) {
      const splitIndex = state.indexOf("|");
      if (splitIndex > -1 && splitIndex + 1 < state.length) {
        return state.substring(splitIndex + 1);
      }
    }
    return "";
  }


  /*
    * Returns whether current window is in ifram for token renewal
    * @ignore
    * @hidden
    */
  private isInIframe() {
    return window.parent !== window;
  }

  loginInProgress(): boolean {
    var pendingCallback = this.pCacheStorage.getItem(Constants.urlHash);
    if (pendingCallback) {
      return true;
    }
    return this.pLoginInProgress;
  }

  private getHostFromUri(uri: string): string {
    // remove http:// or https:// from uri
    var extractedUri = String(uri).replace(/^(https?:)\/\//, "");
    extractedUri = extractedUri.split("/")[0];
    return extractedUri;
  }

  protected getScopesForEndpoint(endpoint: string): Array<string> {
    // if user specified list of unprotectedResources, no need to send token to these endpoints, return null.
    if (this.pConfig.framework.unprotectedResources.length > 0) {
      for (var i = 0; i < this.pConfig.framework.unprotectedResources.length; i++) {
        if (endpoint.indexOf(this.pConfig.framework.unprotectedResources[i]) > -1) {
          return null;
        }
      }
    }

    if (this.pConfig.framework.protectedResourceMap.size > 0) {
      for (let key of Array.from(this.pConfig.framework.protectedResourceMap.keys())) {
        // configEndpoint is like /api/Todo requested endpoint can be /api/Todo/1
        if (endpoint.indexOf(key) > -1) {
          return this.pConfig.framework.protectedResourceMap.get(key);
        }
      }
    }

    // default resource will be clientid if nothing specified
    // App will use idtoken for calls to itself
    // check if it's staring from http or https, needs to match with app host
    if (endpoint.indexOf("http://") > -1 || endpoint.indexOf("https://") > -1) {
      if (this.getHostFromUri(endpoint) === this.getHostFromUri(this.getRedirectUri())) {
        return new Array<string>(this.pConfig.auth.clientId);
      }
    } else {
      // in angular level, the url for $http interceptor call could be relative url,
      // if it's relative call, we'll treat it as app backend call.
      return new Array<string>(this.pConfig.auth.clientId);
    }

    // if not the app's own backend or not a domain listed in the endpoints structure
    return null;
  }

  //These APIS are exposed for msalAngular wrapper only
  protected setloginInProgress(loginInProgress: boolean) {
    this.pLoginInProgress = loginInProgress;
  }

  protected getAcquireTokenInProgress(): boolean {
    return this.pAcquireTokenInProgress;
  }

  protected setAcquireTokenInProgress(acquireTokenInProgress: boolean) {
    this.pAcquireTokenInProgress = acquireTokenInProgress;
  }

  protected getLogger() {
    return this.pConfig.system.logger;
  }
}
