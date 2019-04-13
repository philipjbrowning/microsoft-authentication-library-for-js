var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from } from 'rxjs';
import { tap } from 'rxjs/internal/operators/tap';
import { mergeMap } from 'rxjs/operators';
import { BroadcastService } from './broadcast.service';
import { MsalService } from './msal.service';
import { MSALError } from './MSALError';
let MsalInterceptor = class MsalInterceptor {
    constructor(auth, broadcastService) {
        this.auth = auth;
        this.broadcastService = broadcastService;
    }
    intercept(req, next) {
        const scopes = this.auth.getScopesForEndpoint(req.url);
        this.auth.verbose(`Url: ${req.url} maps to scopes: ${scopes}`);
        if (scopes === null) {
            return next.handle(req);
        }
        const tokenStored = this.auth.getCachedTokenInternal(scopes);
        if (tokenStored && tokenStored.token) {
            req = req.clone({
                setHeaders: {
                    Authorization: `Bearer ${tokenStored.token}`,
                },
            });
            return next.handle(req).pipe(tap((err) => {
                if (err instanceof HttpErrorResponse && err.status === 401) {
                    const scopes = this.auth.getScopesForEndpoint(req.url);
                    const tokenStored = this.auth.getCachedTokenInternal(scopes);
                    if (tokenStored && tokenStored.token) {
                        this.auth.clearCacheForScope(tokenStored.token);
                    }
                    const msalError = new MSALError(JSON.stringify(err), '', JSON.stringify(scopes));
                    this.broadcastService.broadcast('msal:notAuthorized', msalError);
                }
            }));
        }
        else {
            return from(this.auth.acquireTokenSilent(scopes).then(token => {
                const JWT = `Bearer ${token}`;
                return req.clone({
                    setHeaders: {
                        Authorization: JWT,
                    },
                });
            })).pipe(mergeMap(req => next.handle(req).pipe(tap(err => {
                if (err instanceof HttpErrorResponse && err.status === 401) {
                    const scopes = this.auth.getScopesForEndpoint(req.url);
                    const tokenStored = this.auth.getCachedTokenInternal(scopes);
                    if (tokenStored && tokenStored.token) {
                        this.auth.clearCacheForScope(tokenStored.token);
                    }
                    const msalError = new MSALError(JSON.stringify(err), '', JSON.stringify(scopes));
                    this.broadcastService.broadcast('msal:notAuthorized', msalError);
                }
            })))); //calling next.handle means we are passing control to next interceptor in chain
        }
    }
};
MsalInterceptor = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [MsalService, BroadcastService])
], MsalInterceptor);
export { MsalInterceptor };
//# sourceMappingURL=msal.interceptor.js.map