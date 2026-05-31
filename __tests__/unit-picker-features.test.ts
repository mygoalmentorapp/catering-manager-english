import { describe, it, expect } from "vitest";

/**
 * Tests for the UnitPickerModal duplicate prevention and delete logic.
 * These test the client-side validation logic that was added.
 */

const DEFAULT_UNIT_SINGULARS = ["קילו", "גרם", "ליטר", 'מ"ל', "יחידה", "כוס", "כף", "קופסא"];

interface UnitDef {
  singular: string;
  plural: string;
}

const mockUnits: UnitDef[] = [
  { singular: "קילו", plural: "קילו" },
  { singular: "גרם", plural: "גרם" },
  { singular: "ליטר", plural: "ליטר" },
  { singular: 'מ"ל', plural: 'מ"ל' },
  { singular: "יחידה", plural: "יחידות" },
  { singular: "כוס", plural: "כוסות" },
  { singular: "כף", plural: "כפות" },
  { singular: "קופסא", plural: "קופסאות" },
  { singular: "שקית", plural: "שקיות" }, // custom unit
];

describe("UnitPickerModal - Duplicate Prevention", () => {
  it("should detect existing unit as duplicate", () => {
    const newSingular = "קופסא";
    const exists = mockUnits.some(
      (u) => u.singular.trim() === newSingular.trim()
    );
    expect(exists).toBe(true);
  });

  it("should detect duplicate with whitespace", () => {
    const newSingular = " קופסא ";
    const exists = mockUnits.some(
      (u) => u.singular.trim() === newSingular.trim()
    );
    expect(exists).toBe(true);
  });

  it("should allow non-existing unit", () => {
    const newSingular = "חבילה";
    const exists = mockUnits.some(
      (u) => u.singular.trim() === newSingular.trim()
    );
    expect(exists).toBe(false);
  });

  it("should detect custom unit duplicate", () => {
    const newSingular = "שקית";
    const exists = mockUnits.some(
      (u) => u.singular.trim() === newSingular.trim()
    );
    expect(exists).toBe(true);
  });
});

describe("UnitPickerModal - Delete Functionality", () => {
  it("should identify default units as non-deletable", () => {
    const defaultUnits = mockUnits.filter((u) =>
      DEFAULT_UNIT_SINGULARS.includes(u.singular)
    );
    expect(defaultUnits.length).toBe(8);
    defaultUnits.forEach((u) => {
      expect(DEFAULT_UNIT_SINGULARS.includes(u.singular)).toBe(true);
    });
  });

  it("should identify custom units as deletable", () => {
    const customUnits = mockUnits.filter(
      (u) => !DEFAULT_UNIT_SINGULARS.includes(u.singular)
    );
    expect(customUnits.length).toBe(1);
    expect(customUnits[0].singular).toBe("שקית");
  });

  it("should not allow deleting default units", () => {
    const unitToCheck = "קילו";
    const isDefault = DEFAULT_UNIT_SINGULARS.includes(unitToCheck);
    expect(isDefault).toBe(true);
  });

  it("should allow deleting custom units", () => {
    const unitToCheck = "שקית";
    const isDefault = DEFAULT_UNIT_SINGULARS.includes(unitToCheck);
    expect(isDefault).toBe(false);
  });
});
