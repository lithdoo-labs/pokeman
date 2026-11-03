export interface SchemaFormV1 {
  readonly version: 1;
  readonly title?: string;
  readonly description?: string;
  readonly fields: readonly SchemaFormFieldV1[];
  readonly validateOnChange?: string;
  readonly validateOnSubmit?: string;
}

interface SchemaFormFieldBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;
  readonly localstorageKey?: string;
}

export interface SchemaFormStringFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "string";
  readonly default?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface SchemaFormNumberFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "number";
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

export interface SchemaFormBooleanFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "boolean";
  readonly default?: boolean;
}

export interface SchemaFormSelectOptionV1 {
  readonly value: string;
  readonly label: string;
}

export interface SchemaFormSelectFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "select";
  readonly default?: string;
  readonly options: readonly SchemaFormSelectOptionV1[];
}

export type SchemaFormFieldV1 =
  | SchemaFormStringFieldV1
  | SchemaFormNumberFieldV1
  | SchemaFormBooleanFieldV1
  | SchemaFormSelectFieldV1;

export type SchemaFormValueV1 = string | number | boolean;
export type SchemaFormDataV1 = Readonly<Record<string, SchemaFormValueV1>>;

export interface SchemaFormRequestV1 {
  readonly schema: SchemaFormV1;
  readonly initialValue?: SchemaFormDataV1;
  readonly cancelable?: boolean;
  readonly onSubmit?: (
    value: SchemaFormDataV1,
    control: SchemaFormSubmitControlV1,
  ) => void | Promise<void>;
}

export interface SchemaFormExternalValidationErrorV1 {
  readonly field: string;
  readonly errorMsg: string;
}

export interface SchemaFormSubmitControlV1 {
  setLoading(): void;
  cancelLoading(): void;
  sendValidateError(errors: readonly SchemaFormExternalValidationErrorV1[]): void;
  close(): void;
}

export type SchemaFormResultV1 =
  | { readonly type: "submitted"; readonly value: SchemaFormDataV1 }
  | { readonly type: "cancelled" };

export type SchemaFormValidationDataV1 = SchemaFormDataV1;
export type SchemaFormValidationErrorsV1 = Readonly<Record<string, string>>;
export type SchemaFormValidatorResultV1 = null | undefined | SchemaFormValidationErrorsV1;

export interface SchemaFormRenderDataV1 {
  readonly title?: string;
  readonly description?: string;
  readonly cancelable: boolean;
  readonly fieldCount: number;
  readonly restorePending: boolean;
}

interface SchemaFormFieldRenderBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required: boolean;
  readonly error?: string;
  readonly restoreAllowed: boolean;
  readonly localstorageKey?: string;
}

export type SchemaFormFieldRenderDataV1 =
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "string";
      readonly value: string;
      readonly placeholder?: string;
      readonly multiline: boolean;
      readonly minLength?: number;
      readonly maxLength?: number;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "number";
      readonly value?: number;
      readonly min?: number;
      readonly max?: number;
      readonly integer: boolean;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "boolean";
      readonly value: boolean;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "select";
      readonly value?: string;
      readonly options: readonly SchemaFormSelectOptionV1[];
    });

export type SchemaFormPresentationValueV1 = string | number | boolean | null;
export type SchemaFormPresentationValuesV1 =
  Readonly<Record<string, SchemaFormPresentationValueV1>>;

export type SchemaFormErrorCode =
  | "SCHEMA_FORM_INVALID_SCHEMA"
  | "SCHEMA_FORM_INVALID_INITIAL_VALUE"
  | "SCHEMA_FORM_ALREADY_OPEN"
  | "SCHEMA_FORM_VALIDATOR_FAILED"
  | "SCHEMA_FORM_INVALID_VALIDATOR_RESULT";

export class SchemaFormError extends Error {
  readonly code: SchemaFormErrorCode;
  readonly path?: string;

  constructor(
    code: SchemaFormErrorCode,
    message: string = code,
    path?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SchemaFormError";
    this.code = code;
    this.path = path;
  }
}
