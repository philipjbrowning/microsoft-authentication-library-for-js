var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
let BroadcastService = class BroadcastService {
    constructor() {
        this._msalSubject = new BehaviorSubject(1);
        this.msalItem$ = this._msalSubject.asObservable();
    }
    broadcast(type, payload) {
        this._msalSubject.next({ type, payload });
    }
    getMSALSubject() {
        return this._msalSubject;
    }
    getMSALItem() {
        return this.msalItem$;
    }
    subscribe(type, callback) {
        return this.msalItem$.pipe(filter(message => message.type === type), map(message => message.payload)).subscribe(callback);
    }
};
BroadcastService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [])
], BroadcastService);
export { BroadcastService };
//# sourceMappingURL=broadcast.service.js.map