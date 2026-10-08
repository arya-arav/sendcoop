import { describe, expect, it } from "vitest";
import { parseEcbRates } from "./fx-rates";

// The shape of eurofxref-daily.xml, trimmed.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-10-07'>
      <Cube currency='USD' rate='1.0921'/>
      <Cube currency='JPY' rate='162.35'/>
      <Cube currency='GBP' rate='0.84375'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("parseEcbRates", () => {
  it("reads the day and the rates per euro", () => {
    expect(parseEcbRates(XML)).toEqual({
      day: "2026-10-07",
      rates: { USD: 1.0921, JPY: 162.35, GBP: 0.84375 },
    });
  });

  it("refuses anything else", () => {
    expect(parseEcbRates("<html>Maintenance</html>")).toBeNull();
    expect(parseEcbRates("<Cube time='2026-10-07'></Cube>")).toBeNull();
  });
});
