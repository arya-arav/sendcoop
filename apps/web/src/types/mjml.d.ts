// mjml 5 ships no types (and @types/mjml describes the synchronous v4 API).
declare module "mjml" {
  type MjmlError = { line: number; message: string; tagName: string; formattedMessage: string };
  export default function mjml2html(
    input: string,
    options?: {
      validationLevel?: "strict" | "soft" | "skip";
      ignoreIncludes?: boolean;
      minify?: boolean;
    },
  ): Promise<{ html: string; errors: MjmlError[] }>;
}
