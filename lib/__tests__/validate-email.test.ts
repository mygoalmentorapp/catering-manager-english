import { describe, it, expect } from "vitest";
import { validateEmailForRegistration } from "../validate-email";

describe("validateEmailForRegistration", () => {
  describe("State A — Block (invalid format)", () => {
    const invalidEmails = [
      "yosefgmail.com",       // missing @
      "yosef@gmail",          // no dot in domain
      "yosef@gmailcom",       // no dot in domain
      "yosef@ gmail.com",     // space in address
      "yosef@gmail .com",     // space in address
      "@gmail.com",           // no local part
      "yosef@",              // no domain
      "",                     // empty
      "  ",                   // whitespace only
      "yosef@.",             // domain starts/ends with dot
      "yosef@.com",          // domain starts with dot
    ];

    it.each(invalidEmails)("should block: %s", (email) => {
      const result = validateEmailForRegistration(email);
      expect(result.shouldBlock).toBe(true);
      expect(result.shouldShowConfirmModal).toBe(false);
      expect(result.isValidFormat).toBe(false);
      expect(result.message).toContain("כתובת המייל לא נראית תקינה");
    });
  });

  describe("State B — Confirm (valid format)", () => {
    const validEmails = [
      "yosef@gmail.com",
      "yosef@business.co.il",
      "user123@outlook.com",
      "test@walla.co.il",
      "name@company.org",
      "hello@domain.io",
    ];

    it.each(validEmails)("should show confirm modal: %s", (email) => {
      const result = validateEmailForRegistration(email);
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isValidFormat).toBe(true);
      expect(result.isSuspicious).toBe(false);
      expect(result.message).toContain("נשלח לכתובת הזו מייל לאימות החשבון");
    });
  });

  describe("State C — Warn (suspicious)", () => {
    it("should warn for gmail.coms", () => {
      const result = validateEmailForRegistration("yosef@gmail.coms");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.message).toContain("הסיומת של כתובת המייל לא מוכרת לנו");
    });

    it("should warn for gmail.con", () => {
      const result = validateEmailForRegistration("yosef@gmail.con");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
    });

    it("should warn for gamil.com (domain typo)", () => {
      const result = validateEmailForRegistration("yosef@gamil.com");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.suggestion).toContain("gmail.com");
    });

    it("should warn for gmial.com (domain typo)", () => {
      const result = validateEmailForRegistration("yosef@gmial.com");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.suggestion).toContain("gmail.com");
    });

    it("should warn for hotmial.com (domain typo)", () => {
      const result = validateEmailForRegistration("yosef@hotmial.com");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.suggestion).toContain("hotmail.com");
    });

    it("should warn for outlok.com (domain typo)", () => {
      const result = validateEmailForRegistration("yosef@outlok.com");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.suggestion).toContain("outlook.com");
    });

    it("should warn for yaho.com (domain typo)", () => {
      const result = validateEmailForRegistration("yosef@yaho.com");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
      expect(result.suggestion).toContain("yahoo.com");
    });

    it("should warn for gmail.comm (invalid TLD)", () => {
      const result = validateEmailForRegistration("yosef@gmail.comm");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
    });

    it("should warn for gmail.comss (multiple extra chars)", () => {
      const result = validateEmailForRegistration("yosef@gmail.comss");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
    });

    it("should warn for gmail.coma (any invalid TLD)", () => {
      const result = validateEmailForRegistration("yosef@gmail.coma");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
    });

    it("should warn for any unknown TLD like .xyz123", () => {
      const result = validateEmailForRegistration("yosef@gmail.xyz123");
      expect(result.shouldBlock).toBe(false);
      expect(result.shouldShowConfirmModal).toBe(true);
      expect(result.isSuspicious).toBe(true);
    });

    it("should NOT warn for valid .co.il domain", () => {
      const result = validateEmailForRegistration("yosef@company.co.il");
      expect(result.isSuspicious).toBe(false);
    });

    it("should NOT warn for valid .org domain", () => {
      const result = validateEmailForRegistration("yosef@company.org");
      expect(result.isSuspicious).toBe(false);
    });

    it("should NOT warn for valid .io domain", () => {
      const result = validateEmailForRegistration("yosef@app.io");
      expect(result.isSuspicious).toBe(false);
    });

    it("should warn for .con (not a valid TLD)", () => {
      const result = validateEmailForRegistration("yosef@gmail.con");
      expect(result.shouldBlock).toBe(false);
      expect(result.isSuspicious).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should trim whitespace from input", () => {
      const result = validateEmailForRegistration("  yosef@gmail.com  ");
      expect(result.shouldBlock).toBe(false);
      expect(result.isValidFormat).toBe(true);
    });

    it("should handle multiple @ signs", () => {
      // "user@name@gmail.com" — domain becomes "name@gmail.com" which has a dot
      // This is technically weird but the domain has a dot so it passes basic validation
      const result = validateEmailForRegistration("user@name@gmail.com");
      expect(result.shouldBlock).toBe(false);
    });
  });
});
