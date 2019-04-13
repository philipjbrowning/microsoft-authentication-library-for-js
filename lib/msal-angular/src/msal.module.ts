import { CommonModule } from '@angular/common';
import { Injectable, ModuleWithProviders, NgModule } from '@angular/core';
import { BroadcastService } from './broadcast.service';
import { MsalConfig } from './msal-config';
import { MsalGuard } from './msal-guard.service';
import { MSAL_CONFIG, MsalService } from './msal.service';

Injectable()
export class WindowWrapper extends Window {
}

@NgModule({
  imports: [CommonModule],
  declarations: [],
  providers: [MsalGuard, BroadcastService],
})
export class MsalModule {
  static forRoot(config: MsalConfig): ModuleWithProviders {
    return {
      ngModule: MsalModule,
      providers: [
        { provide: MSAL_CONFIG, useValue: config },
        MsalService,
        { provide: WindowWrapper, useValue: window },
      ],
    };
  }
}

