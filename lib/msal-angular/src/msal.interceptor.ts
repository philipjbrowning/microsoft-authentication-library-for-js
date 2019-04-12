import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { tap } from 'rxjs/internal/operators/tap';
import { mergeMap } from 'rxjs/operators';
import { BroadcastService } from './broadcast.service';
import { MsalService } from './msal.service';
import { MSALError } from './MSALError';

@Injectable()
export class MsalInterceptor implements HttpInterceptor {

  constructor(private auth: MsalService, private broadcastService: BroadcastService) {
  }
  
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const scopes = this.auth.getScopesForEndpoint(req.url);
    this.auth.verbose(`Url: ${ req.url } maps to scopes: ${ scopes }`);
    if (scopes === null) {
      return next.handle(req);
    }
    const tokenStored = this.auth.getCachedTokenInternal(scopes);
    if (tokenStored && tokenStored.token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${ tokenStored.token }`,
        },
      });
      return next.handle(req).pipe(
        tap((err) => {
          if (err instanceof HttpErrorResponse && err.status === 401) {
            const scopes = this.auth.getScopesForEndpoint(req.url);
            const tokenStored = this.auth.getCachedTokenInternal(scopes);
            if (tokenStored && tokenStored.token) {
              this.auth.clearCacheForScope(tokenStored.token);
            }
            const msalError = new MSALError(JSON.stringify(err), '', JSON.stringify(scopes));
            this.broadcastService.broadcast('msal:notAuthorized', msalError);
          }
        }),
      );
    } else {
      return from(this.auth.acquireTokenSilent(scopes).then(token => {
        const JWT = `Bearer ${ token }`;
        return req.clone({
          setHeaders: {
            Authorization: JWT,
          },
        });
      })).pipe(
        mergeMap(req => next.handle(req).pipe(
          tap(err => {
            if (err instanceof HttpErrorResponse && err.status === 401) {
              const scopes = this.auth.getScopesForEndpoint(req.url);
              const tokenStored = this.auth.getCachedTokenInternal(scopes);
              if (tokenStored && tokenStored.token) {
                this.auth.clearCacheForScope(tokenStored.token);
              }
              const msalError = new MSALError(JSON.stringify(err), '', JSON.stringify(scopes));
              this.broadcastService.broadcast('msal:notAuthorized', msalError);
            }
          }),
        )),
      ); //calling next.handle means we are passing control to next interceptor in chain
    }
  }
}
