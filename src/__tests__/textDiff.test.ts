// @vitest-environment node
import { describe, expect, it } from "vitest";
import { itemDiff, wordDiff } from "../shared/textDiff";

describe("diferenca por palavra", () => {
  it("diferença por palavra refaz o antes e o depois", () => {
    const d = wordDiff("O lactente tem febre.", "O lactente tem febre alta.");
    expect(d.filter((p) => p.op !== "add").map((p) => p.text).join("")).toBe("O lactente tem febre.");
    expect(d.filter((p) => p.op !== "del").map((p) => p.text).join("")).toBe("O lactente tem febre alta.");
    expect(d.some((p) => p.op === "add" && p.text.includes("alta"))).toBe(true);
  });
  it("textos iguais viram uma parte só; vazio dá lista vazia", () => {
    expect(wordDiff("a b", "a b")).toEqual([{ op: "same", text: "a b" }]);
    expect(wordDiff("", "")).toEqual([]);
    expect(wordDiff("", "novo")).toEqual([{ op: "add", text: "novo" }]);
  });
  it("partes vizinhas do mesmo tipo são unidas", () => {
    const d = wordDiff("um dois tres", "um quatro cinco tres");
    expect(d.map((p) => p.op)).toEqual(["same", "del", "add", "same"]);
  });
  it("diferença por item", () => expect(itemDiff(["a", "b"], ["a", "c"])).toEqual([{ op: "same", text: "a" }, { op: "del", text: "b" }, { op: "add", text: "c" }]));
});
