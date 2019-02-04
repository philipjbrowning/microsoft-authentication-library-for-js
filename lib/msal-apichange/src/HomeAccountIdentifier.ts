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

import { Utils } from "./Utils";

/*
 * @hidden
 */
export class HomeAccountIdentifier {

  private _uid: string;
  get uid(): string {
    return this._uid ? this._uid : "";
  }

  set uid(uid: string) {
    this._uid = uid;
  }

  private _utid: string;
  get utid(): string {
    return this._utid ? this._utid : "";
  }

  set utid(utid: string) {
    this._utid = utid;
  }

  constructor(rawAccountIdentifier: string) {
    if (!rawAccountIdentifier || Utils.isEmpty(rawAccountIdentifier)) {
      this.uid = "";
      this.utid = "";
      return;
    }

    try {
      const decodedAccountIdentifier: string = Utils.base64DecodeStringUrlSafe(rawAccountIdentifier);
      const homeAccountIdentifier: HomeAccountIdentifier = <HomeAccountIdentifier>JSON.parse(decodedAccountIdentifier);
      if (homeAccountIdentifier) {
        if (homeAccountIdentifier.hasOwnProperty("uid")) {
          this.uid = homeAccountIdentifier.uid;
        }

        if (homeAccountIdentifier.hasOwnProperty("utid")) {
          this.utid = homeAccountIdentifier.utid;
        }
      }
    } catch (e) {
      throw new Error(e);
    }
  }
}
