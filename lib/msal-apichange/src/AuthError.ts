/**
  * Copyright (c) Microsoft Corporation
  *  All Rights Reserved
  *  MIT License
  *
  * Permission is hereby granted, free of charge, to any person obtaining a copy of this
  * software and associated documentation files (the "Software"), to deal in the Software
  * without restriction, including without limitation the rights to use, copy, modify,
  * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
  * permit persons to whom the Software is furnished to do so, subject to the following
  * conditions:
  *
  * The above copyright notice and this permission notice shall be
  * included in all copies or substantial portions of the Software.
  *
  * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
  * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
  * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
  * OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
  */

import {Constants} from "./Constants";

/**
 * @hidden
 * 
 * General error class thrown by the MSAL.js library.
 */
export class AuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuthError";
    }
}

/**
 * @hidden
 *
 * Error thrown when there is an error in the client code running on the browser.
 */
export class ClientAuthError extends AuthError {
    constructor(message: string) {
        super(message);
        this.name = "ClientAuthError";
    }

    static createEndpointResolutionAuthError() : ClientAuthError {
        return new ClientAuthError("Error in Could not resolve endpoints. Please check network and try again.");
    }

    static createMultipleMatchingTokensInCacheAuthError(scope: string) : ClientAuthError {
        return new ClientAuthError("Cache error for scope " + scope + ": The cache contains multiple tokens satisfying the requirements. Call AcquireToken again providing more requirements like authority.");
    }

    static createMultipleAuthoritiesInCacheAuthError(scope: string) : ClientAuthError {
        return new ClientAuthError("Cache error for scope " + scope + ": Multiple authorities found in the cache. Pass authority in the API overload.");
    }

    static createPopupWindowError() : ClientAuthError {
        return new ClientAuthError("Error opening popup window. This can happen if you are using IE or if popups are blocked in the browser.");
    }

    static createTokenRenewalTimeoutError() : ClientAuthError {
        return new ClientAuthError("Token renewal operation failed due to timeout.");
    }

    static createInvalidStateError(invalidState: string, actualState: string) : ClientAuthError {
        return new ClientAuthError("Invalid state: " + invalidState + ", should be state: " + actualState);
    }

    static createNonceMismatchError(invalidNonce: string, actualNonce: string) : ClientAuthError {
        return new ClientAuthError("Invalid nonce: " + invalidNonce + ", should be nonce: " + actualNonce);
    }
}

/**
 * @hidden
 *
 * Error thrown when there is an error in the asynchronous client code running on the browser.
 */
export class ClientProgressAuthError extends ClientAuthError {
    constructor(message: string) {
        super(message);
        this.name = "ClientAsyncAuthError";
    }

    static createLoginInProgressError() : ClientProgressAuthError {
        return new ClientProgressAuthError("Login_In_Progress: Error during login call - login is already in progress.");
    }

    static createAcquireTokenInProgressError() : ClientProgressAuthError {
        return new ClientProgressAuthError("AcquireToken_In_Progress: Error during login call - login is already in progress.");
    }

    static createUserCancelledAuthError() : ClientProgressAuthError {
        return new ClientProgressAuthError("User_Cancelled: User cancelled ")
    }
}

/**
 * @hidden
 *
 * Error thrown when there is an error in configuration of the .js library.
 */
export class ClientConfigurationAuthError extends ClientAuthError {
    constructor(message: string) {
        super(message);
        this.name = "ClientConfigurationAuthError";
    }

    static createInvalidCacheLocationAuthError(givenCacheLocation: string) : ClientConfigurationAuthError {
        return new ClientConfigurationAuthError("Cache Location is not valid. Provided value:" + givenCacheLocation + ". Possible values are: " + Constants.cacheLocationLocal + ", " + Constants.cacheLocationSession);
    }

    static createNoCallbackGivenAuthError() : ClientConfigurationAuthError {
        return new ClientConfigurationAuthError("Error in configuration: no callback(s) registered for login/acquireTokenRedirect flows. Plesae call handleRedirectCallbacks() with the appropriate callback signatures. More information is available here: https://github.com/AzureAD/microsoft-authentication-library-for-js/wiki/-basics");
    }

    static createCallbackParametersAuthError(numArgs: number) : ClientAuthError {
        return new ClientConfigurationAuthError("Error occurred in callback - incorrect number of arguments, expected 2, got " + numArgs + ".");
    }

    static createSuccessCallbackParametersAuthError(numArgs: number) : ClientAuthError {
        return new ClientConfigurationAuthError("Error occurred in callback for successful token response - incorrect number of arguments, expected 1, got " + numArgs + ".");
    }

    static createErrorCallbackParametersAuthError(numArgs: number) : ClientAuthError {
        return new ClientConfigurationAuthError("Error occurred in callback for error response - incorrect number of arguments, expected 1, got " + numArgs + ".");
    }

    static createEmptyScopesArrayAuthError() {
        return new ClientConfigurationAuthError("Scopes cannot be passed as empty array.");
    }

    static createScopesNonArrayAuthError() {
        return new ClientConfigurationAuthError("Scopes cannot be passed as non-array.");
    }

    static createClientIdSingleScopeAuthError() {
        return new ClientConfigurationAuthError("Client ID can only be provided as a single scope.");
    }
}

/**
 * @hidden
 *
 * Error thrown when there is an error with the server code, for example, unavailability.
 */
export class ServerAuthError extends AuthError {
    constructor(message: string) {
        super(message);
        this.name = "ServerAuthError";
    }

    static createServerUnavailableError() : ServerAuthError {
        return new ServerAuthError("Server is temporarily unavailable.");
    }
}

/**
 * @hidden
 *
 * Error thrown when the user is required to perform an interactive token request.
 */
export class InteractionRequiredAuthError extends AuthError {
    constructor(message: string) {
        super(message);
        this.name = "InteractionRequiredAuthError";
    }

    static createLoginRequiredAuthError(errorDesc: string) : InteractionRequiredAuthError {
        return new InteractionRequiredAuthError("login_required: User must login. " + errorDesc);
    }

    static createInteractionRequiredAuthError(errorDesc: string) : InteractionRequiredAuthError {
        return new InteractionRequiredAuthError("interaction_required: " + errorDesc);
    }

    static createConsentRequiredAuthError(errorDesc: string) : InteractionRequiredAuthError {
        return new InteractionRequiredAuthError("consent_required: " + errorDesc);
    }
}

/**
 * @hidden
 *
 * Error thrown when the client must provide additional proof to acquire a token. This will be used for conditional access cases.
 */
export class ClaimsRequiredAuthError extends InteractionRequiredAuthError {
    constructor(message: string) {
        super(message);
        this.name = "ClaimsRequiredAuthError";
    }
}


