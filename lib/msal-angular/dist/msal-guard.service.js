var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Location, PlatformLocation } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Constants } from 'msal';
import { AuthenticationResult } from './AuthenticationResult';
import { BroadcastService } from './broadcast.service';
import { MsalConfig } from './msal-config';
import { MSAL_CONFIG, MsalService } from './msal.service';
import { MSALError } from './MSALError';
let MsalGuard = class MsalGuard {
    constructor(config, authService, router, activatedRoute, location, platformLocation, broadcastService) {
        this.config = config;
        this.authService = authService;
        this.router = router;
        this.activatedRoute = activatedRoute;
        this.location = location;
        this.platformLocation = platformLocation;
        this.broadcastService = broadcastService;
        this.isEmpty = function (str) {
            return (typeof str === 'undefined' || !str || 0 === str.length);
        };
    }
    canActivate(route, state) {
        this.authService.getLogger().verbose('location change event from old url to new url');
        this.authService.updateDataFromCache([this.config.clientID]);
        if (!this.authService._oauthData.isAuthenticated && !this.authService._oauthData.userName) {
            if (state.url) {
                if (!this.authService._renewActive && !this.authService.loginInProgress()) {
                    const loginStartPage = this.getBaseUrl() + state.url;
                    if (loginStartPage !== null) {
                        this.authService.getCacheStorage().setItem(Constants.angularLoginRequest, loginStartPage);
                    }
                    if (this.config.popUp) {
                        return new Promise((resolve, reject) => {
                            this.authService.loginPopup(this.config.consentScopes, this.config.extraQueryParameters).then((token) => {
                                resolve(true);
                            }, (error) => {
                                console.error(error);
                                reject(false);
                            });
                        });
                    }
                    else {
                        this.authService.loginRedirect(this.config.consentScopes, this.config.extraQueryParameters);
                    }
                }
            }
        }
        //token is expired/deleted but user data still exists in _oauthData object
        else if (!this.authService._oauthData.isAuthenticated && this.authService._oauthData.userName) {
            return new Promise((resolve) => {
                this.authService.acquireTokenSilent([this.config.clientID]).then((token) => {
                    if (token) {
                        this.authService._oauthData.isAuthenticated = true;
                        const authenticationResult = new AuthenticationResult(token);
                        this.broadcastService.broadcast('msal:loginSuccess', authenticationResult);
                        resolve(true);
                    }
                }, (error) => {
                    const errorParts = error.split('|');
                    const msalError = new MSALError(errorParts[0], errorParts[1], '');
                    this.broadcastService.broadcast('msal:loginFailure', msalError);
                    resolve(false);
                });
            });
        }
        else {
            return true;
        }
    }
    getBaseUrl() {
        let currentAbsoluteUrl = window.location.href;
        const currentRelativeUrl = this.location.path();
        if (this.isEmpty(currentRelativeUrl)) {
            if (currentAbsoluteUrl.endsWith('/')) {
                currentAbsoluteUrl = currentAbsoluteUrl.replace(/\/$/, '');
            }
            return currentAbsoluteUrl;
        }
        else {
            const index = currentAbsoluteUrl.indexOf(currentRelativeUrl);
            return currentAbsoluteUrl.substring(0, index);
        }
    }
};
MsalGuard = __decorate([
    Injectable(),
    __param(0, Inject(MSAL_CONFIG)),
    __metadata("design:paramtypes", [MsalConfig,
        MsalService,
        Router,
        ActivatedRoute,
        Location,
        PlatformLocation,
        BroadcastService])
], MsalGuard);
export { MsalGuard };
//# sourceMappingURL=msal-guard.service.js.map