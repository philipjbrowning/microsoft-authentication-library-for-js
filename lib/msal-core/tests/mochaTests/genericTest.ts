import * as Mocha from "mocha";
import { expect } from "chai";
import {UserAgentApplication, AuthError, ClientConfigurationError, ClientAuthError} from '../../src/index';
import { Constants, ErrorCodes, ErrorDescription} from '../../src/Constants';
import {Authority} from "../../src/Authority";
import {AuthenticationRequestParameters} from "../../src/AuthenticationRequestParameters";
import {AuthorityFactory} from "../../src/AuthorityFactory";
import { jsdom } from "mocha-jsdom";

describe("Redirect Flow Unit Tests", function () {
    // let window: Window;
    let msal: UserAgentApplication;

    // var mockFrames = {};
    // var documentMock = {
    //     getElementById: function (frameId: any) {
    //         if (!mockFrames[frameId]) {
    //             mockFrames[frameId] = { src: 'start' };
    //         }
    //         return mockFrames[frameId];
    //     }
    // };
    jsdom();
    var DEFAULT_INSTANCE = "https://login.microsoftonline.com/";
    var TEST_REDIR_URI = "https://localhost:8081/redirect.html"
    var TENANT = 'common';
    var validAuthority = DEFAULT_INSTANCE + TENANT;
    // let global = <any>{};

    var mockStorage = function() {
        var store = {};

        var accessTokenCacheItem = {
            key: {
                authority: "",
                clientId: "",
                scopes: "",
                userIdentifer: ""
            },
            value: {
                accessToken: "",
                idToken: "",
                expiresIn: "",
                clientInfo: ""
            }
        }

        return {
            getItem: function (key: any, storeAuthStateInCookie?: boolean) {
                if (storeAuthStateInCookie) {
                    return this.getItemCookie(key);
                }
                return store[key];
            },
            setItem: function (key: any, value: any, storeAuthStateInCookie?: boolean) {
                if (typeof value != 'undefined') {
                    store[key] = value;
                }
                if (storeAuthStateInCookie) {
                    this.setItemCookie(key, value);
                }

            },
            removeItem: function (key: any) {
                if (typeof store[key] != 'undefined') {
                    delete store[key];
                }
            },
            clear: function () {
                store = {};
            },
            storeVerify: function () {
                return store;
            },
            getAllAccessTokens: function (clientId: any, userIdentifier: any) {
                var results = [];
                for (var key in store) {
                    if (store.hasOwnProperty(key)) {
                        if (key.match(clientId) && key.match(userIdentifier)) {
                            let value = this.getItem(key);
                            if (value) {
                                let accessTokenCacheItem = <any>{};
                                accessTokenCacheItem.key = JSON.parse(key);
                                accessTokenCacheItem.value = JSON.parse(value);
                                results.push(accessTokenCacheItem);
                            }
                        }
                    }
                }
                return results;
            },

            setItemCookie(cName: string, cValue: string, expires?: number): void {
                var cookieStr = cName + "=" + cValue + ";";
                if (expires) {
                    var expireTime = this.setExpirationCookie(expires);
                    cookieStr += "expires=" + expireTime + ";";
                }

                document.cookie = cookieStr;
            },

            getItemCookie(cName: string): string {
                var name = cName + "=";
                var ca = document.cookie.split(';');
                for (var i = 0; i < ca.length; i++) {
                    var c = ca[i];
                    while (c.charAt(0) == ' ') {
                        c = c.substring(1);
                    }
                    if (c.indexOf(name) == 0) {
                        return c.substring(name.length, c.length);
                    }
                }
                return "";
            },

            removeAcquireTokenEntries: function () {
                return;
            },

            setExpirationCookie(cookieLife: number): string {
                var today = new Date();
                var expr = new Date(today.getTime() + cookieLife * 24 * 60 * 60 * 1000);
                return expr.toUTCString();
            },

            clearCookie(): void {
                this.setItemCookie(Constants.nonceIdToken, '', -1);
                this.setItemCookie(Constants.stateLogin, '', -1);
                this.setItemCookie(Constants.loginRequest, '', -1);
            }
        };
    }();

    beforeEach(function() {
        // mockStorage.clear();
        
        // let $window: any = {
        //     location: {
        //         hash: '#hash',
        //         href: 'href',
        //         replace: function (val: any) {
        //         }
        //     },
        //     localStorage: {},
        //     sessionStorage: {},
        //     innerWidth: 100,
        //     innerHeight: 100
        // };
        // $window.localStorage = mockStorage;
        // $window.sessionStorage = mockStorage;
        
        // // Initialize
        
        // global.window = $window;
        // global.localStorage = mockStorage;
        // global.sessionStorage = mockStorage;
        // global.document = documentMock;

        msal = new UserAgentApplication("0813e1d1-ad72-46a9-8665-399bba48c201", null);
        const validOpenIdConfigurationResponse = `{"authorization_endpoint":"${validAuthority}/oauth2/v2.0/authorize","token_endpoint":"https://token_endpoint","issuer":"https://fakeIssuer", "end_session_endpoint":"https://end_session_endpoint"}`;
    });

    it("throws error if loginRedirect is called without calling setRedirectCallbacks", function (done) {
        expect(msal.getRedirectUri()).to.be(window.location.href);
        try {
            msal.loginRedirect();
        } catch (e) {
            expect(e).to.be.a.instanceOf(ClientConfigurationError);
        }
        done();
    });

});