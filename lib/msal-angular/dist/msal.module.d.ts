import { ModuleWithProviders } from '@angular/core';
import { MsalConfig } from './msal-config';
export declare class WindowWrapper extends Window {
}
export declare class MsalModule {
    static forRoot(config: MsalConfig): ModuleWithProviders;
}
