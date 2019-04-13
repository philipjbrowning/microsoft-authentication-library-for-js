import { BehaviorSubject, Observable, Subscription } from 'rxjs';
export declare type MessageCallback = (payload: any) => void;
export declare class BroadcastService {
    readonly _msalSubject: BehaviorSubject<any>;
    readonly msalItem$: Observable<any>;
    constructor();
    broadcast(type: string, payload: any): void;
    getMSALSubject(): BehaviorSubject<any>;
    getMSALItem(): Observable<any>;
    subscribe(type: string, callback: MessageCallback): Subscription;
}
