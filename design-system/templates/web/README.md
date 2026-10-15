# REIKA DS web components (no build)

Vanilla custom elements in light DOM. Tokens + primitives + one script. Server-rendered markup works without JS.

```html
<link rel="stylesheet" href="/shared/ds/tokens/tokens.css">
<link rel="stylesheet" href="/shared/ds/css/reika.css">
<script src="/shared/ds/web/reika-ds.js" defer></script>
```

Dark mode: add class `dark` to `<html>`. Only global: `window.ReikaDS` (`formatAmount`, `define`, `elements`).

## Elements

| tag | attributes | notes |
|---|---|---|
| `<r-tip label="">text</r-tip>` | label | info button + tooltip; hover, focus, click, Esc |
| `<r-tabs label=""><r-tab for="">..<r-panel id="">` | tab `for` (else by order), `selected` | arrows/Home/End; horizontal scroll-snap; event `r-tabs-change` |
| `<r-dialog id variant heading confirm-label cancel-label danger>` | variant confirm, form, detail | native `<dialog>`; open with `el.open()` or `<button data-r-dialog-open="id">`; events `r-confirm`, `r-close` |
| `<r-notice tone title dismissible no-icon>` | tone info, success, warning, danger, neutral | role alert (warning, danger) or status |
| `<r-amount value currency locale compact sign tone>` | default VND, vi-VN | `tone="auto"` colours by sign; tabular figures |
| `<r-badge tone variant>` | tone primary, success, warning, danger, info; variant solid, outline | CSS only |
| `<r-metric label value currency delta href spark compact>` | spark = `1,3,2,5` | or put your own markup inside |
| `.r-field` (class, CSS only) | wrap label + native input/select/textarea | `data-invalid="true"` or `aria-invalid` shows the error ring |
| `<r-card label label-position description tip>` | label-position inside, outside | wraps children in the body |

CSS-only (no JS, native inputs stay native): `.r-field` and the classes in `css/reika.css`: `.r-btn` (`--primary --outline --ghost --danger --lg --sm --round`), `.r-card`, `.r-field`, `.r-notice`, `.r-listrow`.

## WordPress / Bricks

Copy `shared/ds/` to the theme or `wp-content/uploads/reika-ds/`, then enqueue:

```php
add_action('wp_enqueue_scripts', function () {
  $u = content_url('/uploads/reika-ds');
  wp_enqueue_style('reika-tokens', "$u/tokens/tokens.css", [], '1');
  wp_enqueue_style('reika-ds', "$u/css/reika.css", ['reika-tokens'], '1');
  wp_enqueue_script('reika-ds', "$u/web/reika-ds.js", [], '1', ['strategy' => 'defer', 'in_footer' => true]);
});
```

In Bricks: Settings, Custom code (Header: two `<link>` tags; Body footer: the `<script defer>` tag), or the same PHP in a snippet. Use a Code or Rich Text element for the tags. Not verified inside a live Bricks install.

Demo: open `web/demo.html` (loads the three files by relative path; append `#dark` for dark).

Touch targets: every button, tab, tip and close control has a 44x44 hit area.
