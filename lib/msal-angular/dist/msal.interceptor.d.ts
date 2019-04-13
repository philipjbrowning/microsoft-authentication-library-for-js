import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BroadcastService } from './broadcast.service';
import { MsalService } from './msal.service';
export declare class MsalInterceptor implements HttpInterceptor {
    private auth;
    private broadcastService;
    constructor(auth: MsalService, broadcastService: BroadcastService);
    intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>>;
}
