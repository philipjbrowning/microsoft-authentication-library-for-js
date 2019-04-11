import { Location, PlatformLocation } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { ActivatedRoute, ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { Constants } from 'msal';
import { AuthenticationResult } from './AuthenticationResult';
import { BroadcastService } from './broadcast.service';
import { MsalConfig } from './msal-config';
import { MSAL_CONFIG, MsalService } from './msal.service';
import { MSALError } from './MSALError';

@Injectable()
export class MsalGuard implements CanActivate {

  constructor(@Inject(MSAL_CONFIG) private config: MsalConfig,
              private authService: MsalService,
              private router: Router,
              private activatedRoute: ActivatedRoute,
              private location: Location,
              private platformLocation: PlatformLocation,
              private broadcastService: BroadcastService) {
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | Promise<boolean> {
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
          } else {
            this.authService.loginRedirect(this.config.consentScopes, this.config.extraQueryParameters);
          }
        }
      }
    }
    //token is expired/deleted but user data still exists in _oauthData object
    else if (!this.authService._oauthData.isAuthenticated && this.authService._oauthData.userName) {
      return new Promise((resolve) => {
        this.authService.acquireTokenSilent([this.config.clientID]).then((token: any) => {
          if (token) {
            this.authService._oauthData.isAuthenticated = true;
            const authenticationResult = new AuthenticationResult(token);
            this.broadcastService.broadcast('msal:loginSuccess', authenticationResult);
            resolve(true);
          }
        }, (error: any) => {
          const errorParts = error.split('|');
          const msalError = new MSALError(errorParts[0], errorParts[1], '');
          this.broadcastService.broadcast('msal:loginFailure', msalError);
          resolve(false);
        });
      });
    } else {
      return true;
    }
  }

  private getBaseUrl(): String {
    let currentAbsoluteUrl = window.location.href;
    const currentRelativeUrl = this.location.path();
    if (this.isEmpty(currentRelativeUrl)) {
      if (currentAbsoluteUrl.endsWith('/')) {
        currentAbsoluteUrl = currentAbsoluteUrl.replace(/\/$/, '');
      }
      return currentAbsoluteUrl;
    } else {
      const index = currentAbsoluteUrl.indexOf(currentRelativeUrl);
      return currentAbsoluteUrl.substring(0, index);
    }
  }

  isEmpty = function (str: any) {
    return (typeof str === 'undefined' || !str || 0 === str.length);
  };
}
