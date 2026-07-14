import { nextDocumentNumber } from "@/lib/document-number";

function makeTx(seqState?: {
  id: string;
  lastValue: number;
  prefix: string;
  pattern: string;
  padLength: number;
}) {
  const state = seqState
    ? { ...seqState }
    : null;
  return {
    documentSequence: {
      findFirst: jest.fn(async () => state),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "seq1",
        lastValue: 0,
        padLength: 6,
        prefix: data.prefix,
        pattern: data.pattern,
        ...data,
      })),
      update: jest.fn(async ({ data }: { data: { lastValue: { increment: number } } }) => {
        const current = state?.lastValue ?? 0;
        const lastValue = current + data.lastValue.increment;
        if (state) state.lastValue = lastValue;
        return {
          id: state?.id ?? "seq1",
          lastValue,
          padLength: state?.padLength ?? 6,
          prefix: state?.prefix ?? "PO",
          pattern: state?.pattern ?? "{PREFIX}/{YYYYMM}/{SEQUENCE}",
        };
      }),
    },
  };
}

describe("nextDocumentNumber", () => {
  it("creates sequence when missing", async () => {
    const tx = makeTx();
    const n = await nextDocumentNumber(tx as never, "c1", "PO");
    expect(tx.documentSequence.create).toHaveBeenCalled();
    expect(n).toMatch(/^PO\/\d{6}\/000001$/);
  });

  it("increments existing sequence", async () => {
    const tx = makeTx({
      id: "s1",
      lastValue: 5,
      prefix: "SO",
      pattern: "{PREFIX}/{YYYY}/{SEQUENCE}",
      padLength: 4,
    });
    const n = await nextDocumentNumber(tx as never, "c1", "SO", "branchxyz");
    expect(n).toContain("SO/");
    expect(n.endsWith("/0006")).toBe(true);
  });

  it("uses docType as prefix fallback and branch token", async () => {
    const tx = makeTx({
      id: "s2",
      lastValue: 0,
      prefix: "XX",
      pattern: "{PREFIX}/{BRANCH}/{YY}/{MM}/{SEQUENCE}",
      padLength: 3,
    });
    const n = await nextDocumentNumber(tx as never, "c1", "CUSTOM", "jkt01");
    expect(n).toContain("JKT");
    expect(n.endsWith("/001")).toBe(true);
  });

  it("uses HQ when branch missing in pattern", async () => {
    const tx = makeTx({
      id: "s3",
      lastValue: 0,
      prefix: "PO",
      pattern: "{PREFIX}/{BRANCH}/{SEQUENCE}",
      padLength: 2,
    });
    const n = await nextDocumentNumber(tx as never, "c1", "PO", null);
    expect(n).toContain("HQ");
  });

  it("uses unknown docType prefix", async () => {
    const tx = makeTx();
    await nextDocumentNumber(tx as never, "c1", "XYZ");
    expect(tx.documentSequence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ prefix: "XYZ" }),
      }),
    );
  });
});
