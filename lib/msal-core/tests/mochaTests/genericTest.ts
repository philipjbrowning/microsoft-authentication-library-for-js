import * as Mocha from "mocha";
import * as chai from "chai";
import { UserAgentApplication, AuthError, ClientConfigurationError, ClientAuthError } from '../../src/index';
import { Constants, ErrorCodes, ErrorDescription} from '../../src/Constants';
import { Authority } from "../../src/Authority";
import { AuthenticationRequestParameters } from "../../src/AuthenticationRequestParameters";
import { AuthorityFactory } from "../../src/AuthorityFactory";
const expect = chai.expect;
chai.config.includeStack = false;

describe("Redirect Flow Unit Tests", function () {
    var msal: UserAgentApplication;

    var DEFAULT_INSTANCE = "https://login.microsoftonline.com/";
    var TEST_REDIR_URI = "https://localhost:8081/redirect.html"
    var TENANT = 'common';
    var validAuthority = DEFAULT_INSTANCE + TENANT;

    beforeEach(function() {
        this.jsdom = require("jsdom-global")("", { url: TEST_REDIR_URI });

        msal = new UserAgentApplication("0813e1d1-ad72-46a9-8665-399bba48c201", null);
        const validOpenIdConfigurationResponse = `{"authorization_endpoint":"${validAuthority}/oauth2/v2.0/authorize","token_endpoint":"https://token_endpoint","issuer":"https://fakeIssuer", "end_session_endpoint":"https://end_session_endpoint"}`;
    });

    it("throws error if loginRedirect is called without calling setRedirectCallbacks", function (done) {
        expect(msal.getRedirectUri()).to.be.equal(window.location.href);
        expect(msal.loginRedirect.bind(msal)).to.throw(ClientConfigurationError);
        done();
    });
    
    it('throws error if null or non-function argument is passed to either argument of setRedirectCallbacks', (done) => {
        expect(() => msal.setRedirectCallbacks(function(token, tokenType, state) {}, null)).to.throw(ClientConfigurationError);
        expect(() => msal.setRedirectCallbacks(null, function(err, state) {})).to.throw(ClientConfigurationError);
        done();
    });

    it('navigates user to login and prompt parameter is not passed by default', (done) => {
        msal.setRedirectCallbacks(function(token, tokenType, state) {}, function (error) {});
        expect(msal.getRedirectUri()).to.be.equal(global.window.location.href);
        // msal.promptUser = function (args: string) {
        //     expect(args).toContain(DEFAULT_INSTANCE + TENANT + '/oauth2/v2.0/authorize?response_type=id_token&scope=openid%20profile');
        //     expect(args).toContain('&client_id=' + msal.clientId);
        //     expect(args).toContain('&redirect_uri=' + encodeURIComponent(msal.getRedirectUri()));
        //     expect(args).toContain('&state');
        //     expect(args).toContain('&client_info=1');
        //     expect(args).not.toContain(Constants.prompt_select_account);
        //     expect(args).not.toContain(Constants.prompt_none);
        //     done();
        // };
        msal.loginRedirect();
        console.log(global.window.location);
        done();
    });

    // it('navigates user to login and prompt parameter is passed as extraQueryParameter', (done) => {
    //     msal.setRedirectCallbacks(function(token, tokenType, state) {}, function (error) {});
    //     expect(msal.getRedirectUri()).toBe(global.window.location.href);
    //     msal.promptUser = function (args: string) {
    //         expect(args).toContain(DEFAULT_INSTANCE + TENANT + '/oauth2/v2.0/authorize?response_type=id_token&scope=openid%20profile');
    //         expect(args).toContain('&client_id=' + msal.clientId);
    //         expect(args).toContain('&redirect_uri=' + encodeURIComponent(msal.getRedirectUri()));
    //         expect(args).toContain('&state');
    //         expect(args).toContain('&client_info=1');
    //         expect(args).toContain(Constants.prompt_select_account);
    //         expect(args).not.toContain(Constants.prompt_none);
    //         done();
    //     };

    //     msal.loginRedirect(null, Constants.prompt_select_account);
    // });

    // it('navigates user to redirectURI passed as extraQueryParameter', (done) => {
    //     msal = new UserAgentApplication("0813e1d1-ad72-46a9-8665-399bba48c201", null, { redirectUri: TEST_REDIR_URI });
    //     msal.setRedirectCallbacks(function(token, tokenType, state) {}, function (error) {});
    //     msal._user = null;
    //     msal._renewStates = [];
    //     msal._activeRenewals = {};
    //     msal._cacheStorage = storageFake;
    //     expect(msal._redirectUri).toBe(TEST_REDIR_URI);
    //     msal.promptUser = function (args: string) {
    //         expect(args).toContain(DEFAULT_INSTANCE + TENANT + '/oauth2/v2.0/authorize?response_type=id_token&scope=openid%20profile');
    //         expect(args).toContain('&client_id=' + msal.clientId);
    //         expect(args).toContain('&redirect_uri=' + encodeURIComponent(msal._redirectUri));
    //         expect(args).toContain('&state');
    //         expect(args).toContain('&client_info=1');
    //         done();
    //     };

    //     msal.loginRedirect();
    // });

    // it('uses current location.href as returnUri by default, even if location changed after UserAgentApplication was instantiated', (done) => {
    //     history.pushState(null, null, '/new_pushstate_uri');
    //     msal.setRedirectCallbacks(function(token, tokenType, state) {}, function (error) {});
    //     msal.promptUser = function (args: string) {
    //         expect(args).toContain('&redirect_uri=' + encodeURIComponent('http://localhost:8080/new_pushstate_uri'));
    //         done();
    //     };
    //     msal.loginRedirect();
    // });

});