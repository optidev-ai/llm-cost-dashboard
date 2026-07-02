import * as J from "@babel/core";
function k(N = {}) {
  const {
    exclude: X = ["node_modules", ".git", "dist"],
    skipElements: $ = [
      "html",
      "body",
      "head",
      "meta",
      "link",
      "script",
      "style",
      "Fragment"
    ]
  } = N;
  function I(e, r, s) {
    let h;
    const p = [];
    if (s.isIdentifier(e))
      h = e.name;
    else if (s.isMemberExpression(e)) {
      let c = e;
      for (; s.isMemberExpression(c); )
        s.isIdentifier(c.property) && p.unshift(c.property.name), c = c.object;
      if (!s.isIdentifier(c)) return null;
      h = c.name;
    } else
      return null;
    const l = r.findIndex(
      (c) => c.itemVar === h
    );
    if (l === -1) return null;
    const i = [], f = [];
    for (let c = 0; c <= l; c++) {
      const o = r[c];
      if (!o || !o.arrayName || !o.indexVar) continue;
      let b = o.arrayName;
      if (c > 0 && b && b.includes(".")) {
        const y = b.split("."), S = y[0];
        for (let j = 0; j < c; j++)
          if (r[j]?.itemVar === S) {
            b = y.slice(1).join(".");
            break;
          }
      }
      c === 0 ? i.push(`${b}[`) : i.push(`].${b}[`), f.push(s.identifier(o.indexVar));
    }
    let d = "]";
    return p.length > 0 && (d += `.${p.join(".")}`), i.push(d), { templateElements: i.map((c, o) => s.templateElement(
      {
        raw: c,
        cooked: c
      },
      o === i.length - 1
    )), expressions: f };
  }
  function v(e, r, s) {
    const h = /* @__PURE__ */ new Set(), p = new Set(
      r.map((i) => i.itemVar).filter(Boolean)
    );
    function l(i) {
      if (s.isIdentifier(i))
        p.has(i.name) || h.add(i.name);
      else if (s.isMemberExpression(i)) {
        let f = i;
        for (; s.isMemberExpression(f); )
          f = f.object;
        s.isIdentifier(f) && !p.has(f.name) && h.add(f.name);
      } else if (s.isCallExpression(i)) {
        s.isIdentifier(i.callee) ? p.has(i.callee.name) || h.add(i.callee.name) : s.isMemberExpression(i.callee) && l(i.callee);
        for (const f of i.arguments)
          s.isExpression(f) && l(f);
      } else if (s.isTemplateLiteral(i))
        for (const f of i.expressions)
          s.isExpression(f) && l(f);
      else if (s.isBinaryExpression(i))
        l(i.left), l(i.right);
      else if (s.isLogicalExpression(i))
        l(i.left), l(i.right);
      else if (s.isConditionalExpression(i))
        l(i.test), l(i.consequent), l(i.alternate);
      else if (s.isUnaryExpression(i))
        l(i.argument);
      else if (s.isUpdateExpression(i))
        l(i.argument);
      else if (s.isSequenceExpression(i))
        for (const f of i.expressions)
          s.isExpression(f) && l(f);
    }
    return l(e), h;
  }
  const F = function({
    types: e
  }) {
    return {
      visitor: {
        JSXOpeningElement(r, s) {
          if (r.node.attributes.some(
            (n) => e.isJSXAttribute(n) && n.name.name === "data-source"
          )) return;
          let p;
          if (e.isJSXIdentifier(r.node.name))
            p = r.node.name.name;
          else if (e.isJSXMemberExpression(r.node.name))
            p = r.node.name.property.name;
          else return;
          if (!p || $.includes(p) || p.includes("Fragment") || p.includes("Provider"))
            return;
          const l = r.node.loc?.start;
          if (!l) return;
          const f = (s.file.opts.filename || "").replace(process.cwd(), "");
          let d = r.parentPath, A = 0;
          const c = 20, o = [];
          for (; d && A < c; ) {
            if (e.isArrowFunctionExpression(d.node) || e.isFunctionExpression(d.node)) {
              const n = d.parentPath;
              if (n && e.isCallExpression(n.node)) {
                const t = n.node.callee;
                if (e.isMemberExpression(t) && e.isIdentifier(t.property)) {
                  const E = t.property.name;
                  if (["map", "forEach", "filter", "reduce"].includes(E)) {
                    const a = {
                      arrayName: null,
                      itemVar: null,
                      indexVar: null
                    };
                    if (e.isIdentifier(t.object))
                      a.arrayName = t.object.name;
                    else if (e.isMemberExpression(t.object)) {
                      const u = [];
                      let x = t.object;
                      for (; e.isMemberExpression(x); )
                        e.isIdentifier(x.property) && u.unshift(x.property.name), x = x.object;
                      e.isIdentifier(x) && u.unshift(x.name), a.arrayName = u.join(".");
                    } else if (e.isArrayExpression(t.object)) {
                      const u = t.object.loc?.start;
                      u && (a.arrayName = `$src:${u.line}:${u.column}`, a.isInlineArray = !0);
                    }
                    const m = d.node.params;
                    if (m.length > 0 && e.isIdentifier(m[0]) && (a.itemVar = m[0].name), m.length > 1 && e.isIdentifier(m[1]))
                      a.indexVar = m[1].name;
                    else {
                      const u = `_idx${o.length}`;
                      a.indexVar = u, d.node.params.push(e.identifier(u));
                    }
                    o.unshift(a);
                  }
                }
              }
            }
            d = d.parentPath, A++;
          }
          const b = `${f}:${l.line}:${l.column}`;
          let y;
          const j = (o.length > 0 ? o[o.length - 1] : null)?.indexVar;
          j ? y = e.jsxAttribute(
            e.jsxIdentifier("data-source"),
            e.jsxExpressionContainer(
              e.templateLiteral(
                [
                  e.templateElement({
                    raw: b + "[",
                    cooked: b + "["
                  }),
                  e.templateElement({
                    raw: "]",
                    cooked: "]"
                  })
                ],
                [e.identifier(j)]
              )
            )
          ) : y = e.jsxAttribute(
            e.jsxIdentifier("data-source"),
            e.stringLiteral(b)
          );
          const M = r.node.attributes.findIndex(
            (n) => e.isJSXSpreadAttribute(n)
          );
          M >= 0 ? r.node.attributes.splice(M, 0, y) : r.node.attributes.push(y);
          const w = r.parentPath;
          if (!w) return;
          const g = w.get("children");
          if (!Array.isArray(g)) return;
          const P = /* @__PURE__ */ new Set();
          for (const n of g) {
            if (!n.isJSXExpressionContainer()) continue;
            const t = n.node.expression;
            if (!e.isExpression(t)) continue;
            v(t, o, e).forEach((a) => P.add(a));
          }
          const V = g.find(
            (n) => n.isJSXExpressionContainer() && (e.isMemberExpression(n.node.expression) || e.isIdentifier(n.node.expression))
          );
          if (V && o.length > 0) {
            const n = V.node.expression;
            if (e.isMemberExpression(n) || e.isIdentifier(n)) {
              const t = I(n, o, e);
              if (t) {
                const { templateElements: E, expressions: a } = t, m = e.jsxAttribute(
                  e.jsxIdentifier("data-bind"),
                  e.jsxExpressionContainer(
                    e.templateLiteral(E, a)
                  )
                );
                r.node.attributes.push(m);
              }
            }
          }
          if (!V && o.length > 0) {
            const n = g.find(
              (t) => t.isJSXExpressionContainer() && e.isCallExpression(t.node.expression) && e.isMemberExpression(t.node.expression.callee) && e.isIdentifier(t.node.expression.callee.property) && t.node.expression.callee.property.name === "map"
            );
            if (n) {
              const a = n.node.expression.callee.object;
              if (e.isMemberExpression(a) || e.isIdentifier(a)) {
                const m = I(
                  a,
                  o,
                  e
                );
                if (m) {
                  const { templateElements: u, expressions: x } = m, C = e.jsxAttribute(
                    e.jsxIdentifier("data-bind"),
                    e.jsxExpressionContainer(
                      e.templateLiteral(u, x)
                    )
                  );
                  r.node.attributes.push(C);
                }
              }
            }
          }
          if (!r.node.attributes.some(
            (n) => e.isJSXAttribute(n) && n.name.name === "data-bind"
          ) && o.length > 0) {
            let n = !1;
            const E = r.parentPath?.parentPath;
            if (E && (e.isArrowFunctionExpression(E.node) || e.isFunctionExpression(E.node))) {
              const a = E.parentPath;
              a && e.isCallExpression(a.node) && e.isMemberExpression(a.node.callee) && e.isIdentifier(a.node.callee.property) && ["map", "forEach", "filter"].includes(
                a.node.callee.property.name
              ) && (n = !0);
            }
            if (n) {
              const a = o[o.length - 1];
              if (a?.itemVar) {
                const m = I(
                  e.identifier(a.itemVar),
                  o,
                  e
                );
                if (m) {
                  const { templateElements: u, expressions: x } = m, C = e.jsxAttribute(
                    e.jsxIdentifier("data-bind"),
                    e.jsxExpressionContainer(
                      e.templateLiteral(u, x)
                    )
                  );
                  r.node.attributes.push(C);
                }
              }
            }
          }
          if (P.size > 0) {
            const n = Array.from(P).sort().join(","), t = e.jsxAttribute(
              e.jsxIdentifier("data-optidev-dynamic"),
              e.stringLiteral(n)
            );
            r.node.attributes.push(t);
          }
        }
      }
    };
  };
  return {
    name: "vite-plugin-inject-source",
    enforce: "pre",
    transform(e, r) {
      if (process.env.NODE_ENV !== "development" || X.some((s) => r.includes(s)) || !r.endsWith(".jsx") && !r.endsWith(".tsx")) return null;
      try {
        const s = J.transformSync(e, {
          filename: r,
          ast: !1,
          plugins: [
            ["@babel/plugin-syntax-jsx"],
            ["@babel/plugin-syntax-typescript", { isTSX: !0 }],
            F
          ],
          parserOpts: {
            sourceType: "module",
            plugins: ["jsx", "typescript"]
          },
          babelrc: !1,
          configFile: !1,
          sourceMaps: !1
        });
        if (s?.code)
          return { code: s.code, map: null };
      } catch (s) {
        throw s instanceof Error && (s.stack = ""), s;
      }
      return null;
    }
  };
}
export {
  k as default,
  k as injectSourcePlugin
};
