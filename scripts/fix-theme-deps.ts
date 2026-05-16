/**
 * This script adds `useThemeContext` import and `colorScheme` destructuring
 * to all component files that use `colorScheme` in useMemo deps but don't
 * have the import yet.
 */
import * as fs from "fs";
import * as path from "path";

const files = [
  "app/order.tsx",
  "app/orders.tsx",
  "app/products.tsx",
  "app/shopping-list-edit.tsx",
  "app/shopping-list-view.tsx",
  "app/shopping-list.tsx",
  "app/shopping-lists.tsx",
  "app/changes-review.tsx",
];

const importLine = `import { useThemeContext } from "@/lib/theme-provider";`;

for (const file of files) {
  const filePath = path.resolve("/home/ubuntu/catering-manager", file);
  let content = fs.readFileSync(filePath, "utf-8");
  
  // Skip if already has the import
  if (content.includes("useThemeContext")) {
    console.log(`SKIP (already has import): ${file}`);
    continue;
  }
  
  // Add import after the last import line
  const lines = content.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("import ") || lines[i].startsWith("} from ")) {
      lastImportIdx = i;
    }
    // Stop after we hit non-import code
    if (lastImportIdx > 0 && !lines[i].startsWith("import ") && !lines[i].startsWith("} from ") && !lines[i].startsWith("  ") && !lines[i].trim().startsWith("//") && lines[i].trim() !== "" && !lines[i].includes(" from ")) {
      break;
    }
  }
  
  // Find the actual last import (look for the last line containing "from")
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("from \"") || lines[i].includes("from '")) {
      lastImportIdx = i;
      break;
    }
  }
  
  // Actually find last import more reliably
  let insertIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if ((lines[i].includes("} from \"") || lines[i].includes("} from '") || lines[i].match(/^import .+ from /)) && !lines[i].includes("//")) {
      insertIdx = i;
    }
  }
  
  lines.splice(insertIdx + 1, 0, importLine);
  content = lines.join("\n");
  
  // Now add `const { colorScheme } = useThemeContext();` at the top of each function
  // that uses colorScheme in useMemo but doesn't have it declared
  // Find all lines with `colorScheme` in useMemo
  const memoLines: number[] = [];
  const updatedLines = content.split("\n");
  for (let i = 0; i < updatedLines.length; i++) {
    if (updatedLines[i].includes("useMemo") && updatedLines[i].includes("colorScheme")) {
      memoLines.push(i);
    }
  }
  
  // For each memo line, find the function/component it belongs to and add colorScheme destructuring
  // We need to find the function start and add `const { colorScheme } = useThemeContext();` after the first line
  // Strategy: look backwards from memo line for "function " or "export default function" or "=> {"
  const insertedAt = new Set<number>();
  for (const memoLine of memoLines) {
    // Search backwards for function declaration
    let funcStart = -1;
    for (let i = memoLine - 1; i >= 0; i--) {
      if (updatedLines[i].match(/^(export\s+default\s+)?function\s+\w+/) || 
          updatedLines[i].match(/^\s*(export\s+default\s+)?function\s+\w+/)) {
        funcStart = i;
        break;
      }
    }
    if (funcStart === -1) continue;
    
    // Check if colorScheme is already declared between funcStart and memoLine
    let alreadyDeclared = false;
    for (let i = funcStart; i < memoLine; i++) {
      if (updatedLines[i].includes("colorScheme") && updatedLines[i].includes("useThemeContext")) {
        alreadyDeclared = true;
        break;
      }
    }
    if (alreadyDeclared) continue;
    if (insertedAt.has(funcStart)) continue;
    
    // Find the opening brace of the function
    let braceIdx = funcStart;
    for (let i = funcStart; i < memoLine; i++) {
      if (updatedLines[i].includes("{")) {
        braceIdx = i;
        break;
      }
    }
    
    // Insert after the opening brace line
    updatedLines.splice(braceIdx + 1, 0, `  const { colorScheme } = useThemeContext();`);
    insertedAt.add(funcStart);
    // Adjust remaining memo line indices
    for (let j = memoLines.indexOf(memoLine) + 1; j < memoLines.length; j++) {
      memoLines[j]++;
    }
  }
  
  fs.writeFileSync(filePath, updatedLines.join("\n"));
  console.log(`FIXED: ${file}`);
}

console.log("Done!");
