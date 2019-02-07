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
 * General exception class thrown by the MSAL.js library.
 */
export class MSALException extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MSALException";
    }
}

/**
 * @hidden
 *
 * Exception thrown when there is an error in the client code running on the browser.
 */
export class MSALClientException extends MSALException {
    constructor(message: string) {
        super(message);
        this.name = "MSALClientException";
    }

    static createEndpointResolutionException() : MSALClientException {
        return new MSALClientException("Error in Could not resolve endpoints. Please check network and try again.");
    }

    static createMultipleMatchingTokensInCacheException(scope: string) : MSALClientException {
        return new MSALClientException("Cache error for scope " + scope + ": The cache contains multiple tokens satisfying the requirements. Call AcquireToken again providing more requirements like authority.");
    }

    static createMultipleAuthoritiesInCacheException(scope: string) : MSALClientException {
        return new MSALClientException("Cache error for scope " + scope + ": Multiple authorities found in the cache. Pass authority in the API overload.");
    }

    static createPopupWindowError() : MSALClientException {
        return new MSALClientException("Error opening popup window. This can happen if you are using IE or if popups are blocked in the browser.");
    }

    static createTokenRenewalTimeoutError() : MSALClientException {
        return new MSALClientException("Token renewal operation failed due to timeout.");
    }
}

/**
 * @hidden
 *
 * Exception thrown when there is an error in the asynchronous client code running on the browser.
 */
export class MSALClientProgressException extends MSALClientException {
    constructor(message: string) {
        super(message);
        this.name = "MSALClientAsyncException";
    }

    static createLoginInProgressError() : MSALClientProgressException {
        return new MSALClientProgressException("Login_In_Progress: Error during login call - login is already in progress.");
    }

    static createAcquireTokenInProgressError() : MSALClientProgressException {
        return new MSALClientProgressException("AcquireToken_In_Progress: Error during login call - login is already in progress.");
    }

    static createUserCancelledException() : MSALClientProgressException {
        return new MSALClientProgressException("User_Cancelled: User cancelled ")
    }
}

/**
 * @hidden
 *
 * Exception thrown when there is an error in configuration of the MSAL.js library.
 */
export class MSALClientConfigurationException extends MSALClientException {
    constructor(message: string) {
        super(message);
        this.name = "MSALClientConfigurationException";
    }

    static createInvalidCacheLocationException(givenCacheLocation: string) : MSALClientConfigurationException {
        return new MSALClientConfigurationException("Cache Location is not valid. Provided value:" + givenCacheLocation + ". Possible values are: " + Constants.cacheLocationLocal + ", " + Constants.cacheLocationSession);
    }

    static createNoCallbackGivenException() : MSALClientConfigurationException {
        return new MSALClientConfigurationException("Error in configuration: no callback(s) registered for login/acquireTokenRedirect flows. Plesae call handleRedirectCallbacks() with the appropriate callback signatures. More information is available here: https://github.com/AzureAD/microsoft-authentication-library-for-js/wiki/MSAL-basics");
    }

    static createCallbackParametersException(numArgs: number) : MSALClientException {
        return new MSALClientConfigurationException("Error occurred in callback - incorrect number of arguments, expected 2, got " + numArgs + ".");
    }

    static createSuccessCallbackParametersException(numArgs: number) : MSALClientException {
        return new MSALClientConfigurationException("Error occurred in callback for successful token response - incorrect number of arguments, expected 1, got " + numArgs + ".");
    }

    static createErrorCallbackParametersException(numArgs: number) : MSALClientException {
        return new MSALClientConfigurationException("Error occurred in callback for error response - incorrect number of arguments, expected 1, got " + numArgs + ".");
    }

    static createEmptyScopesArrayException() {
        return new MSALClientConfigurationException("Scopes cannot be passed as empty array.");
    }

    static createScopesNonArrayException() {
        return new MSALClientConfigurationException("Scopes cannot be passed as non-array.");
    }

    static createClientIdSingleScopeException() {
        return new MSALClientConfigurationException("Client ID can only be provided as a single scope.");
    }
}

/**
 * @hidden
 *
 * Exception thrown when there is an error with the server code, for example, unavailability.
 */
export class MSALServerException extends MSALException {
    constructor(message: string) {
        super(message);
        this.name = "MSALServerException";
    }
}

/**
 * @hidden
 *
 * Exception thrown when the user is required to perform an interactive token request.
 */
export class MSALInteractionRequiredException extends MSALException {
    constructor(message: string) {
        super(message);
        this.name = "MSALInteractionRequiredException";
    }

    static createLoginRequiredException(errorDesc: string) : MSALInteractionRequiredException {
        return new MSALInteractionRequiredException("login_required: User must login. " + errorDesc);
    }

    static createInteractionRequiredException(errorDesc: string) : MSALInteractionRequiredException {
        return new MSALInteractionRequiredException("interaction_required: " + errorDesc);
    }

    static createConsentRequiredException(errorDesc: string) : MSALInteractionRequiredException {
        return new MSALInteractionRequiredException("consent_required: " + errorDesc);
    }
}

/**
 * @hidden
 *
 * Exception thrown when the client must provide additional proof to acquire a token. This will be used for conditional access cases.
 */
export class MSALClaimsRequiredException extends MSALInteractionRequiredException {
    constructor(message: string) {
        super(message);
        this.name = "MSALClaimsRequiredException";
    }
}


