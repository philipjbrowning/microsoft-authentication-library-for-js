
// make CacheStorage a fixed type to limit it to specific inputs
type storage = "localStorage" | "sessionStorage";

// Protocol Support
interface AuthParams {
  clientId: string;
  authority?: string;
  validateAuthority?: boolean;
  redirectUri?: string | (() => string);
  postLogoutRedirectUri?: string | (() => string);
  state?: string;
  navigateToLoginRequestUrl?: boolean;
}

// Cache Support
interface CacheParams {
  cacheLocation?: storage;
  storeAuthStateInCookie?: boolean;
}

// Library support
interface SystemParams {
  // logger?: Logger;
  loadFrameTimeout?: number;
  tokenRenewalOffsetSeconds?: number;
}

// Developer App Environment Support
interface FrameworkParams {
  isAngular?: boolean;
  unprotectedResources?: Array<string>;
  protectedResourceMap?: Map<string, Array<string>>;
}

// Configuration Object
export type Config = {
  auth: AuthParams,
  cache?: CacheParams,
  system?: SystemParams,
  framework?: FrameworkParams
}

class Configuration {

   private pConfigObject: Config;
   private pAuthOptions: AuthParams;
 
  // AuthParams Builder
  addAuthOptions( {
      clientId = "",
      authority = null,
      validateAuthority = true,
      redirectUri = () => window.location.href.split("?")[0].split("#")[0],
      postLogoutRedirectUri = () => window.location.href.split("?")[0].split("#")[0],
      state = "",
      navigateToLoginRequestUrl = true }: AuthParams) {
  }

  // CacheParams Builder
  addCacheOptions( {
      cacheLocation = "sessionStorage",
      storeAuthStateInCookie = false }: CacheParams) { 

  }

  // SystemParams Builder
  addSystemOptions( {
      // logger = new Logger(null), // instance of logger defined elsewhere
      loadFrameTimeout = 6000,
      tokenRenewalOffsetSeconds = 300 }: SystemParams) { 

        var pSystemOptions: SystemParams;
        pSystemOptions.loadFrameTimeout = loadFrameTimeout;
        pSystemOptions.tokenRenewalOffsetSeconds = tokenRenewalOffsetSeconds;

        return pSystemOptions;
  }

  // FrameworkParams Builder
  addFrameworkOptions( {
      isAngular = false,
      unprotectedResources = new Array<string>(),
      protectedResourceMap = new Map<string, Array<string>>() }: FrameworkParams) {
  }

  // constructs a TS pbject
  constructor(clientId: string) {
    this.pAuthOptions.clientId = clientId;
    this.pConfigObject.auth = this.pAuthOptions;
  }
}

var client = "client";
var c = new Configuration(client);








