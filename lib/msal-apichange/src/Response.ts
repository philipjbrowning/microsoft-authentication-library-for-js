// This Result object will be wrapped in a class and returned in the registered callback
export type Auth Response = {
    uniqueId: string;
    tenantId: string;
    tokenType: string;
    idToken : object; 
    accessToken: object; 
    scopes: Array<string>;  
    expiresOn: Date;
    account: Account;
    userState: string;
};
