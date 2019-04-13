var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MsalModule_1;
import { CommonModule } from '@angular/common';
import { Injectable, NgModule } from '@angular/core';
import { BroadcastService } from './broadcast.service';
import { MsalGuard } from './msal-guard.service';
import { MSAL_CONFIG, MsalService } from './msal.service';
Injectable();
export class WindowWrapper extends Window {
}
let MsalModule = MsalModule_1 = class MsalModule {
    static forRoot(config) {
        return {
            ngModule: MsalModule_1,
            providers: [
                { provide: MSAL_CONFIG, useValue: config },
                MsalService,
                { provide: WindowWrapper, useValue: window },
            ],
        };
    }
};
MsalModule = MsalModule_1 = __decorate([
    NgModule({
        imports: [CommonModule],
        declarations: [],
        providers: [MsalGuard, BroadcastService],
    })
], MsalModule);
export { MsalModule };
//# sourceMappingURL=msal.module.js.map