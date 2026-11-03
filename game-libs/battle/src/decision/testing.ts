import type { DeepSeekTransport } from "../decision.js";

type DeepSeekTransportResponse = Awaited<ReturnType<DeepSeekTransport["postResponses"]>>;

export interface FakeDeepSeekRequest {
  readonly bodyText: string;
  readonly signal: AbortSignal;
}

export class DeferredDeepSeekResponse {
  readonly promise: Promise<DeepSeekTransportResponse>;
  #resolve!: (response: DeepSeekTransportResponse) => void;
  #reject!: (error: unknown) => void;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  resolve(status: number, bodyText: string): void {
    this.#resolve(Object.freeze({ status, bodyText }));
  }

  reject(error: unknown = new Error("Fake DeepSeek network failure")): void {
    this.#reject(error);
  }
}

type FakeStep =
  | { readonly type: "response"; readonly response: DeepSeekTransportResponse }
  | { readonly type: "reject"; readonly error: unknown }
  | { readonly type: "deferred"; readonly deferred: DeferredDeepSeekResponse };

export class FakeDeepSeekTransport implements DeepSeekTransport {
  readonly requests: FakeDeepSeekRequest[] = [];
  readonly #steps: FakeStep[] = [];

  enqueueResponse(status: number, bodyText: string): this {
    this.#steps.push({ type: "response", response: Object.freeze({ status, bodyText }) });
    return this;
  }

  enqueueReject(error: unknown = new Error("Fake DeepSeek network failure")): this {
    this.#steps.push({ type: "reject", error });
    return this;
  }

  enqueueDeferred(): DeferredDeepSeekResponse {
    const deferred = new DeferredDeepSeekResponse();
    this.#steps.push({ type: "deferred", deferred });
    return deferred;
  }

  postResponses(bodyText: string, signal: AbortSignal): Promise<DeepSeekTransportResponse> {
    this.requests.push(Object.freeze({ bodyText, signal }));
    const step = this.#steps.shift();
    if (step === undefined) return Promise.reject(new Error("FakeDeepSeekTransport script exhausted"));
    if (step.type === "response") return Promise.resolve(step.response);
    if (step.type === "reject") return Promise.reject(step.error);
    return step.deferred.promise;
  }
}
