/* @ds-bundle: {"namespace":"PaisaWatchUI","components":[{"name":"CollapsibleSectionList","sourcePath":"components/general/CollapsibleSectionList/CollapsibleSectionList.jsx"},{"name":"DecimalInput","sourcePath":"components/general/DecimalInput/DecimalInput.jsx"},{"name":"DeleteConfirmForm","sourcePath":"components/general/DeleteConfirmForm/DeleteConfirmForm.jsx"},{"name":"LedgerFilter","sourcePath":"components/general/LedgerFilter/LedgerFilter.jsx"},{"name":"SegmentedControl","sourcePath":"components/general/SegmentedControl/SegmentedControl.jsx"},{"name":"SheetSelect","sourcePath":"components/general/SheetSelect/SheetSelect.jsx"},{"name":"ToggleField","sourcePath":"components/general/ToggleField/ToggleField.jsx"}],"sourceHashes":{"components/general/CollapsibleSectionList/CollapsibleSectionList.jsx":"08b94601b6dc","components/general/CollapsibleSectionList/CollapsibleSectionList.d.ts":"aad1954d7004","components/general/CollapsibleSectionList/CollapsibleSectionList.prompt.md":"00948037b53e","components/general/DecimalInput/DecimalInput.jsx":"b651bd06fb2c","components/general/DecimalInput/DecimalInput.d.ts":"13b929fc26a5","components/general/DecimalInput/DecimalInput.prompt.md":"9e60cc0e61bb","components/general/DeleteConfirmForm/DeleteConfirmForm.jsx":"d55a4777abfa","components/general/DeleteConfirmForm/DeleteConfirmForm.d.ts":"d84ac5b5f05c","components/general/DeleteConfirmForm/DeleteConfirmForm.prompt.md":"e763c0690d45","components/general/LedgerFilter/LedgerFilter.jsx":"4668f02d669d","components/general/LedgerFilter/LedgerFilter.d.ts":"3e53256a2ce0","components/general/LedgerFilter/LedgerFilter.prompt.md":"fd888e2cebca","components/general/SegmentedControl/SegmentedControl.jsx":"69e53ae70429","components/general/SegmentedControl/SegmentedControl.d.ts":"bcc1207a11d7","components/general/SegmentedControl/SegmentedControl.prompt.md":"865ea6a623f4","components/general/SheetSelect/SheetSelect.jsx":"8f249e569d22","components/general/SheetSelect/SheetSelect.d.ts":"5c63a27bfcd2","components/general/SheetSelect/SheetSelect.prompt.md":"b5a475c48088","components/general/ToggleField/ToggleField.jsx":"734dd6cfa7a6","components/general/ToggleField/ToggleField.d.ts":"db85d340dca8","components/general/ToggleField/ToggleField.prompt.md":"84782db49841"},"inlinedExternals":[],"builtBy":"cc-design-sync"} */
"use strict";
var PaisaWatchUI = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx9(t, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c);
      }
      function jsxs7(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx9;
      module.exports.jsxs = jsxs7;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs7 : jsx9)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // packages/ui/dist/index.js
  var index_exports = {};
  __export(index_exports, {
    CollapsibleSectionList: () => CollapsibleSectionList,
    DecimalInput: () => DecimalInput,
    DeleteConfirmForm: () => DeleteConfirmForm,
    LedgerFilter: () => LedgerFilter,
    SegmentedControl: () => SegmentedControl,
    SheetSelect: () => SheetSelect,
    ToggleField: () => ToggleField
  });
  init_define_import_meta_env();
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  var import_jsx_runtime2 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime3 = __toESM(require_react_shim(), 1);
  var import_react = __toESM(require_react_shim(), 1);
  var import_jsx_runtime4 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime5 = __toESM(require_react_shim(), 1);
  var import_react2 = __toESM(require_react_shim(), 1);
  var import_react3 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime6 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime7 = __toESM(require_react_shim(), 1);
  var import_react4 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime8 = __toESM(require_react_shim(), 1);
  function sanitizeDecimalInput(value, options = {}) {
    const allowNegative = options.allowNegative === true;
    let result = "";
    let seenDot = false;
    let seenDigit = false;
    for (const char of value) {
      if (char >= "0" && char <= "9") {
        result += char;
        seenDigit = true;
        continue;
      }
      if (char === "." && !seenDot) {
        result += char;
        seenDot = true;
        continue;
      }
      if (char === "-" && allowNegative && result.length === 0 && !seenDigit) {
        result += char;
      }
    }
    return result;
  }
  function DecimalInput({
    allowNegative,
    onChange,
    onValueChange,
    ...props
  }) {
    function handleChange(event) {
      const next = sanitizeDecimalInput(event.target.value, { allowNegative });
      event.target.value = next;
      onValueChange?.(next);
      onChange?.(event);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "text", inputMode: "decimal", ...props, onChange: handleChange });
  }
  function ToggleField({
    id,
    name,
    label,
    help,
    defaultChecked = false
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "pw-toggle-field", htmlFor: id, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "pw-toggle-field-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "pw-toggle-field-label", children: label }),
        help ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "pw-field-help", children: help }) : null
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "input",
        {
          id,
          name,
          type: "checkbox",
          className: "pw-toggle-input",
          defaultChecked
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "pw-toggle-track", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "pw-toggle-thumb" }) })
    ] });
  }
  function SegmentedControl({
    name,
    value,
    options,
    onChange,
    "aria-label": ariaLabel,
    disabled = false
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: "pw-segmented",
        role: "radiogroup",
        "aria-label": ariaLabel,
        "aria-disabled": disabled || void 0,
        children: [
          name ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("input", { name, type: "hidden", value }) : null,
          options.map((option) => {
            const selected = option.value === value;
            return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                role: "radio",
                "aria-checked": selected,
                className: selected ? "pw-segmented-option is-selected" : "pw-segmented-option",
                disabled,
                onClick: () => onChange(option.value),
                children: option.label
              },
              option.value
            );
          })
        ]
      }
    );
  }
  function RequiredMark() {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "pw-required-mark", "aria-hidden": "true", children: "*" });
  }
  function SheetSelect({
    id,
    name,
    label,
    value,
    options,
    onChange,
    disabled = false,
    required = false,
    errorId,
    invalid = false,
    error
  }) {
    const [open, setOpen] = (0, import_react.useState)(false);
    const titleId = (0, import_react.useId)();
    const closeRef = (0, import_react.useRef)(null);
    const selected = options.find((option) => option.value === value);
    (0, import_react.useEffect)(() => {
      if (!open) {
        return;
      }
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      closeRef.current?.focus();
      function onKeyDown(event) {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }
      window.addEventListener("keydown", onKeyDown);
      return () => {
        document.body.style.overflow = previousOverflow;
        window.removeEventListener("keydown", onKeyDown);
      };
    }, [open]);
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "pw-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { htmlFor: id, children: [
        label,
        required ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(RequiredMark, {}) : null
      ] }),
      name ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { name, type: "hidden", value }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "button",
        {
          id,
          type: "button",
          className: invalid ? "pw-sheet-trigger is-invalid" : "pw-sheet-trigger",
          disabled: disabled || options.length === 0,
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          "aria-describedby": errorId,
          onClick: () => setOpen(true),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: selected?.label ?? "Select\u2026" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "pw-sheet-trigger-chevron", "aria-hidden": "true", children: "\u25BE" })
          ]
        }
      ),
      error ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "pw-field-error", id: errorId, role: "alert", children: error }) : null,
      open ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "pw-sheet-root", role: "presentation", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            className: "pw-sheet-backdrop",
            "aria-label": "Close",
            onClick: () => setOpen(false)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            className: "pw-sheet",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "pw-sheet-header", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("h2", { id: titleId, children: label }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    ref: closeRef,
                    type: "button",
                    className: "pw-sheet-close",
                    onClick: () => setOpen(false),
                    children: "Done"
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: "pw-sheet-list", children: options.map((option) => {
                const isSelected = option.value === value;
                return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    type: "button",
                    className: isSelected ? "pw-sheet-option is-selected" : "pw-sheet-option",
                    "aria-current": isSelected ? "true" : void 0,
                    onClick: () => {
                      onChange(option.value);
                      setOpen(false);
                    },
                    children: option.label
                  }
                ) }, option.value);
              }) })
            ]
          }
        )
      ] }) : null
    ] });
  }
  var LIST_PAGE_SIZE = 6;
  function visibleItemCount(total, loadedPages) {
    if (total <= 0 || loadedPages <= 0) {
      return 0;
    }
    return Math.min(total, loadedPages * LIST_PAGE_SIZE);
  }
  function nextLoadedPages(loadedPages, total) {
    if (visibleItemCount(total, loadedPages) >= total) {
      return loadedPages;
    }
    return loadedPages + 1;
  }
  function hasMoreItems(total, loadedPages) {
    return visibleItemCount(total, loadedPages) < total;
  }
  function CollapsibleSectionList({
    headingId,
    heading,
    toggleLabel,
    trailing,
    children
  }) {
    const items = import_react3.Children.toArray(children);
    const listId = `${headingId}-list`;
    const [expanded, setExpanded] = (0, import_react3.useState)(true);
    const [loadedPages, setLoadedPages] = (0, import_react3.useState)(1);
    const scrollRef = (0, import_react3.useRef)(null);
    const visible = visibleItemCount(items.length, loadedPages);
    const more = hasMoreItems(items.length, loadedPages);
    const paged = items.length > LIST_PAGE_SIZE;
    (0, import_react3.useLayoutEffect)(() => {
      const list = scrollRef.current;
      if (!list || !paged) {
        if (list) {
          list.style.maxHeight = "";
        }
        return;
      }
      if (list.dataset.pageHeightLocked === "true") {
        return;
      }
      const rows = Array.from(list.children).filter(
        (node) => node instanceof HTMLElement && !node.classList.contains("pw-list-more-peek")
      );
      if (rows.length === 0) {
        return;
      }
      const height = rows.reduce((sum, row) => sum + row.offsetHeight, 0);
      list.style.maxHeight = `${height}px`;
      list.dataset.pageHeightLocked = "true";
    }, [expanded, paged, visible]);
    (0, import_react3.useEffect)(() => {
      if (!expanded || !more) {
        return;
      }
      const list = scrollRef.current;
      if (!list) {
        return;
      }
      function onScroll() {
        const el = scrollRef.current;
        if (!el) {
          return;
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 32) {
          setLoadedPages((current) => nextLoadedPages(current, items.length));
        }
      }
      list.addEventListener("scroll", onScroll, { passive: true });
      return () => list.removeEventListener("scroll", onScroll);
    }, [expanded, more, items.length]);
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "pw-section-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { id: headingId, children: heading }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "pw-section-heading-actions", children: [
          trailing,
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "pw-section-toggle",
              "aria-expanded": expanded,
              "aria-controls": listId,
              "aria-label": expanded ? `Collapse ${toggleLabel}` : `Expand ${toggleLabel}`,
              onClick: () => {
                setExpanded((current) => {
                  if (current) {
                    setLoadedPages(1);
                  }
                  return !current;
                });
              },
              children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { "aria-hidden": "true", viewBox: "0 0 16 16", fill: "none", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                "path",
                {
                  d: "M4 6.5 8 10.5 12 6.5",
                  stroke: "currentColor",
                  strokeWidth: "1.6",
                  strokeLinecap: "round",
                  strokeLinejoin: "round"
                }
              ) })
            }
          )
        ] })
      ] }),
      expanded ? /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "ul",
        {
          id: listId,
          ref: scrollRef,
          className: paged ? "pw-list pw-list-paged" : "pw-list",
          children: [
            items.slice(0, visible),
            more ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("li", { className: "pw-list-more-peek", "aria-hidden": "true" }) : null
          ]
        }
      ) : null
    ] });
  }
  function monthKey(occurredAt) {
    return occurredAt.slice(0, 7);
  }
  function monthLabel(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(void 0, {
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    });
  }
  function LedgerFilter({
    rows,
    headingId,
    toggleLabel
  }) {
    const [query, setQuery] = (0, import_react2.useState)("");
    const [month, setMonth] = (0, import_react2.useState)("");
    const showFilters = rows.length > LIST_PAGE_SIZE;
    const months = (0, import_react2.useMemo)(() => {
      const keys = new Set(rows.map((row) => monthKey(row.occurredAt)));
      return Array.from(keys).sort().reverse();
    }, [rows]);
    const filtered = (0, import_react2.useMemo)(() => {
      if (!showFilters) {
        return rows;
      }
      const normalizedQuery = query.trim().toLowerCase();
      return rows.filter((row) => {
        const matchesQuery = normalizedQuery.length === 0 || row.description.toLowerCase().includes(normalizedQuery);
        const matchesMonth = month.length === 0 || monthKey(row.occurredAt) === month;
        return matchesQuery && matchesMonth;
      });
    }, [rows, query, month, showFilters]);
    const isFiltering = query.trim().length > 0 || month.length > 0;
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
      showFilters ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "pw-ledger-filter", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "pw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${headingId}-search`, children: "Search description" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "input",
            {
              id: `${headingId}-search`,
              type: "text",
              value: query,
              onChange: (event) => setQuery(event.target.value),
              placeholder: "e.g. groceries"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "pw-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { htmlFor: `${headingId}-month`, children: "Month" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            "select",
            {
              id: `${headingId}-month`,
              value: month,
              onChange: (event) => setMonth(event.target.value),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "", children: "All time" }),
                months.map((key) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: key, children: monthLabel(key) }, key))
              ]
            }
          )
        ] })
      ] }) : null,
      filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "pw-empty", children: "No Transactions match your search." }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        CollapsibleSectionList,
        {
          headingId,
          heading: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
            "Transaction ledger",
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "pw-section-count", children: isFiltering ? `${filtered.length} of ${rows.length}` : rows.length })
          ] }),
          toggleLabel,
          children: filtered.map((row) => row.node)
        }
      )
    ] });
  }
  var initialState = {};
  function DeleteConfirmForm({
    action,
    hiddenFields,
    confirmLabel
  }) {
    const [state, formAction, pending] = (0, import_react4.useActionState)(action, initialState);
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("form", { action: formAction, children: [
      Object.entries(hiddenFields).map(([name, value]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("input", { type: "hidden", name, value }, name)),
      state.formError ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "pw-banner-error", role: "alert", children: state.formError }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("button", { className: "pw-button pw-button-danger", type: "submit", disabled: pending, children: pending ? "Deleting\u2026" : confirmLabel })
    ] });
  }
  return __toCommonJS(index_exports);
})();
window.PaisaWatchUI=PaisaWatchUI.__dsMainNs?Object.assign({},PaisaWatchUI,PaisaWatchUI.__dsMainNs,{__dsMainNs:undefined}):PaisaWatchUI;
