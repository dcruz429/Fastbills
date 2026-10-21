import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, forwardRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { emptyMedicalRecord } from "../../../../shared/medical-records";

const contacts = [
  { id: 1, fingerprint: "one", contactPerson: "Alice Example", contactDetails: "Example Office", contactNumber: "555-0101", email: "alice@example.test", faxNumber: "555-0102" },
  { id: 2, fingerprint: "two", contactPerson: "Bob Example", contactDetails: "Example Office", contactNumber: "555-0201", email: "", faxNumber: "" },
];

function harness(file: string, component: string, initialProps: any, formHost = false) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: any = {};
  const states: unknown[] = [];
  const controls = new Map<string, any>();
  const selects: any[] = [];
  const effects: (() => void)[] = [];
  const requireReal = createRequire(import.meta.url);
  let index = 0;
  let form: any;
  let dialog: any;
  let picker: any;
  let props = initialProps;
  const control = (tag: string) => forwardRef<any, any>(({ children, variant: _variant, size: _size, ...attributes }, ref) => {
    if (attributes["data-testid"]) controls.set(attributes["data-testid"], attributes);
    return createElement(tag, { ...attributes, ref }, children);
  });
  runInNewContext(code, {
    exports, Date,
    require(name: string) {
      if (name === "react") return {
        ...requireReal("react"),
        useState(initial: any) {
          const slot = index++;
          if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
          return [states[slot], (next: any) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
        },
        useEffect: (effect: () => void) => { effects.push(effect); },
      };
      if (name === "react/jsx-runtime") {
        const runtime = requireReal(name);
        const wrap = (fn: any) => (type: any, attributes: any, key: any) => {
          if (type === "form") form = attributes;
          if (typeof attributes?.onValueChange === "function") selects.push(attributes);
          return fn(type, attributes, key);
        };
        return { ...runtime, jsx: wrap(runtime.jsx), jsxs: wrap(runtime.jsxs) };
      }
      if (name === "@/components/ui/button") return { Button: control("button") };
      if (name === "@/components/ui/input") return { Input: control("input") };
      if (name === "@/components/medical-records/contact-picker") return {
        MedicalContactPicker(attributes: any) { picker = attributes; return null; },
      };
      if (name === "@/components/ui/dialog") return Object.fromEntries([
        "Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogDescription", "DialogFooter",
      ].map(key => [key, ({ children, ...attributes }: any) => {
        if (key === "DialogContent") dialog = attributes;
        return createElement("div", null, children);
      }]));
      return requireReal(name);
    },
  });
  return {
    controls, selects, runEffects() { effects.splice(0).forEach(effect => effect()); },
    get form() { return form; }, get picker() { return picker; }, get dialog() { return dialog; },
    render(nextProps = props) {
      props = nextProps;
      index = 0;
      controls.clear();
      selects.length = 0;
      effects.length = 0;
      const element = createElement(exports[component], props);
      return renderToStaticMarkup(formHost ? createElement("form", null, element) : element);
    },
  };
}

function keyboard(key: string) {
  return { key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
}

test("saved contacts open and search inside the request form rather than an outside portal", () => {
  const f = harness("./contact-picker.tsx", "MedicalContactPicker", {
    contacts, draft: emptyMedicalRecord(1, "", ""), onChange: () => {},
  }, true);
  assert.ok(!f.render().includes("dropdown-medical-contact"));
  f.controls.get("picker-medical-contact").onClick();
  const opened = f.render();
  assert.ok(opened.includes("dropdown-medical-contact"));
  assert.ok(opened.indexOf('data-testid="dropdown-medical-contact"') < opened.indexOf("</form>"));
  assert.ok(f.controls.has("option-medical-contact-1"));
  assert.ok(f.controls.has("option-medical-contact-2"));
  f.controls.get("input-medical-contact-search").onChange({ target: { value: "555-0201" } });
  f.render();
  assert.ok(!f.controls.has("option-medical-contact-1"));
  assert.ok(f.controls.has("option-medical-contact-2"));
  assert.equal(f.controls.get("option-medical-contact-2").type, "button");
});

test("selecting an organization variant fills all contact fields, clears missing details and leaves the request intact", () => {
  const original = { ...emptyMedicalRecord(1, "10/21/2026", "Staff"), patientName: "Synthetic Patient", notes: "Keep request notes", email: "old@example.test", faxNumber: "Old fax" };
  let selected: any;
  const f = harness("./contact-picker.tsx", "MedicalContactPicker", { contacts, draft: original, onChange: (value: any) => { selected = value; } });
  f.render();
  f.controls.get("picker-medical-contact").onClick();
  f.render();
  f.controls.get("option-medical-contact-2").onClick();
  assert.equal(selected.contactDetails, "Example Office");
  assert.equal(selected.contactPerson, "Bob Example");
  assert.equal(selected.contactNumber, "555-0201");
  assert.equal(selected.email, "");
  assert.equal(selected.faxNumber, "");
  assert.equal(selected.patientName, original.patientName);
  assert.equal(selected.notes, original.notes);
  assert.ok(!f.render().includes("dropdown-medical-contact"));
  assert.equal(original.email, "old@example.test");
});

test("keyboard selection cannot submit the parent form and Escape closes only the picker", () => {
  let selected: any;
  const f = harness("./contact-picker.tsx", "MedicalContactPicker", { contacts, draft: emptyMedicalRecord(1, "", ""), onChange: (value: any) => { selected = value; } });
  f.render();
  f.controls.get("picker-medical-contact").onClick();
  f.render();
  const down = keyboard("ArrowDown");
  f.controls.get("input-medical-contact-search").onKeyDown(down);
  f.render();
  const enter = keyboard("Enter");
  f.controls.get("input-medical-contact-search").onKeyDown(enter);
  assert.equal(down.prevented, true);
  assert.equal(enter.prevented, true);
  assert.equal(selected.contactPerson, "Bob Example");
  f.render();
  f.controls.get("picker-medical-contact").onClick();
  f.render();
  const escape = keyboard("Escape");
  f.controls.get("input-medical-contact-search").onKeyDown(escape);
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
  assert.ok(!f.render().includes("dropdown-medical-contact"));
});

test("no-match searches allow manual entry and Enter does not submit an empty selection", () => {
  const f = harness("./contact-picker.tsx", "MedicalContactPicker", { contacts: [], draft: emptyMedicalRecord(1, "", ""), onChange: () => assert.fail("No contact should be selected") });
  f.render();
  f.controls.get("picker-medical-contact").onClick();
  assert.ok(f.render().includes("Enter new details in the fields below"));
  const enter = keyboard("Enter");
  f.controls.get("input-medical-contact-search").onKeyDown(enter);
  assert.equal(enter.prevented, true);
});

test("new request accepts picked contacts and free-text edits and submits the current details", () => {
  let saved: any;
  const f = harness("./request-editor.tsx", "MedicalRequestEditor", {
    open: true, onOpenChange: () => {}, tabs: [{ id: 1, name: "HW", sortOrder: 0 }], contacts,
    userName: "Staff", request: null, initialTabId: 1, saving: false, onSave: (value: any) => { saved = value; },
  });
  f.render();
  f.controls.get("input-medical-patientName").onChange({ target: { value: "Synthetic Patient" } });
  f.render();
  f.picker.onChange({ ...f.picker.draft, ...Object.fromEntries(["contactPerson", "contactDetails", "contactNumber", "email", "faxNumber"].map(key => [key, (contacts[0] as any)[key]])) });
  f.render();
  assert.equal(f.controls.get("input-medical-contactPerson").value, contacts[0].contactPerson);
  assert.equal(f.controls.get("input-medical-contactDetails").value, contacts[0].contactDetails);
  for (const [key, value] of Object.entries({
    contactDetails: "New organization", contactPerson: "New person", contactNumber: "555-9999",
    email: "new@example.test / alternate@example.test", faxNumber: "",
  })) {
    f.controls.get(`input-medical-${key}`).onChange({ target: { value } });
    f.render();
  }
  f.form.onSubmit({ preventDefault() {} });
  assert.equal(saved.patientName, "Synthetic Patient");
  assert.equal(saved.contactDetails, "New organization");
  assert.equal(saved.contactPerson, "New person");
  assert.equal(saved.contactNumber, "555-9999");
  assert.equal(saved.email, "new@example.test / alternate@example.test");
  assert.equal(saved.faxNumber, "");
});

test("the parent dialog does not dismiss before the open contact picker can handle Escape", () => {
  const f = harness("./request-editor.tsx", "MedicalRequestEditor", {
    open: true, onOpenChange: () => {}, tabs: [{ id: 1, name: "HW", sortOrder: 0 }], contacts,
    userName: "Staff", request: null, initialTabId: 1, saving: false, onSave: () => {},
  });
  f.render();
  const inside = { ...keyboard("Escape"), target: { closest: () => ({}) } };
  f.dialog.onEscapeKeyDown(inside);
  assert.equal(inside.prevented, true);
  const outside = { ...keyboard("Escape"), target: { closest: () => null } };
  f.dialog.onEscapeKeyDown(outside);
  assert.equal(outside.prevented, false);
});

const editorProps = {
  open: true, onOpenChange: () => {},
  tabs: [
    { id: 1, name: "HW", sortOrder: 0 }, { id: 2, name: "GC", sortOrder: 1 },
    { id: 3, name: "URGENT", sortOrder: 2 }, { id: 4, name: "Not Found", sortOrder: 3 },
  ],
  contacts, userName: "Staff", request: null, initialTabId: 1, saving: false, onSave: (_value: any) => {},
};

test("new requests populate Clinic Location from the initial and every newly selected workbook tab", () => {
  let saved: any;
  const f = harness("./request-editor.tsx", "MedicalRequestEditor", { ...editorProps, onSave: (value: any) => { saved = value; } });
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, "HW");
  f.runEffects();
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, "HW");
  f.controls.get("input-medical-patientName").onChange({ target: { value: "Synthetic Patient" } });
  for (const tab of editorProps.tabs.slice(1)) {
    f.selects[0].onValueChange(String(tab.id));
    f.render();
    assert.equal(f.controls.get("input-medical-clinicLocation").value, tab.name);
    f.form.onSubmit({ preventDefault() {} });
    assert.equal(saved.tabId, tab.id);
    assert.equal(saved.clinicLocation, tab.name);
    assert.equal(saved.patientName, "Synthetic Patient");
  }
});

test("Clinic Location stays editable and reopening a new request restores the selected tab's default", () => {
  const props = { ...editorProps, initialTabId: 2 };
  const f = harness("./request-editor.tsx", "MedicalRequestEditor", props);
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, "GC");
  f.controls.get("input-medical-clinicLocation").onChange({ target: { value: "Custom location" } });
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, "Custom location");
  f.render({ ...props, open: false });
  f.runEffects();
  f.render(props);
  f.runEffects();
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, "GC");
});

test("editing existing requests preserves their Clinic Location even when changing workbook tabs", () => {
  let saved: any;
  const request = { ...emptyMedicalRecord(1, "", "Staff"), patientName: "Synthetic Patient", clinicLocation: "Original historical location" };
  const f = harness("./request-editor.tsx", "MedicalRequestEditor", {
    ...editorProps, request, onSave: (value: any) => { saved = value; },
  });
  f.render();
  f.runEffects();
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, request.clinicLocation);
  f.selects[0].onValueChange("2");
  f.render();
  assert.equal(f.controls.get("input-medical-clinicLocation").value, request.clinicLocation);
  f.form.onSubmit({ preventDefault() {} });
  assert.equal(saved.tabId, 2);
  assert.equal(saved.clinicLocation, request.clinicLocation);
});

test("legacy Sent records open as Completed and the editor offers only Pending and Completed", () => {
  const request = { ...emptyMedicalRecord(1, "", "Staff"), patientName: "Synthetic Patient", status: "sent" };
  const f = harness("./request-editor.tsx", "MedicalRequestEditor", { ...editorProps, request });
  const html = f.render();
  assert.equal(f.selects[1].value, "completed");
  assert.ok(!html.includes('value="sent"'));
});
