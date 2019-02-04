// This Result object will be wrapped in a class and returned in the registered callback
export type TokenRequestResult = {
    uniqueId: string;
    tenantId: string;
    idToken : object; 
    accessToken: object; 
    scopes: Array<string>;  
    expiresOn: Date;
    account: Account;
    userState: string;
};
