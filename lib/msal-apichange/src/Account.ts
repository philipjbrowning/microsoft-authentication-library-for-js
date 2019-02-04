/**
 * Copyright (c) Microsoft Corporation
 *  All Rights Reserved
 *  MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the 'Software'), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
 * OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
 * OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { HomeAccountIdentifier } from "./HomeAccountIdentifier";
import { IdToken } from "./IdToken";
import { Utils } from "./Utils";

/*
export type Account {
    accountIdentifier: string; 
    homeAccountIdentifier: string;  // userIdentifier renamed
    userName: string; // displayableID renamed
    name: string;
    idToken: Object;
    sid: string; 
    environment: string;   // identityProvider renamed
}
*/

export class Account {

    accountIdentifier: string; 
    homeAccountIdentifier: string;  // userIdentifier renamed
    userName: string; // displayableID renamed
    name: string;
    idToken: Object;
    sid: string; 
    environment: string;   // identityProvider renamed

    /*
     * @hidden
     */
    constructor(accountIdentifier: string, homeAccountIdentifier: string, userName: string, name: string, idToken: Object, sid: string, environment: string) {
        this.accountIdentifier = accountIdentifier;
        this.homeAccountIdentifier = homeAccountIdentifier;
        this.userName = userName;
        this.name = name;
        this.idToken = idToken;
        this.sid = sid;
        this.environment = environment;
    }

    /*
     * @hidden
     */
    static createAccount(idToken: IdToken, clientInfo: HomeAccountIdentifier): Account {
        // Construct accountIdentifier

        let accountUid: string;
        let accountUtid: string;

        if (!idToken) {
            accountUid = "";
            accountUtid = "";
        }
        else {
            accountUid = idToken.uid;
            accountUtid = idToken.utid;
        }

        // Construct HomeAccountIdentifier
        let uid: string;
        let utid: string;

        if (!clientInfo) {
            uid = "";
            utid = "";
        }
        else {
            uid = clientInfo.uid;
            utid = clientInfo.utid;
        }

        const accountIdentifier = Utils.base64EncodeStringUrlSafe(accountUid) + "." + Utils.base64EncodeStringUrlSafe(accountUtid);
        const homeAccountIdentifier = Utils.base64EncodeStringUrlSafe(uid) + "." + Utils.base64EncodeStringUrlSafe(utid);

        return new Account(accountIdentifier, homeAccountIdentifier, idToken.preferredName, idToken.name, idToken.decodedIdToken, idToken.sid, idToken.issuer);
    }
}
