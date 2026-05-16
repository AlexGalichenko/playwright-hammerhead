# playwright-hammerhead

A Playwright-compatible API layer for Safari automation via [testcafe-hammerhead](https://github.com/DevExpress/testcafe-hammerhead) proxy and [modern-screenshot](https://github.com/qq15725/modern-screenshot).

---

## API coverage

### Page

| Method | Status | Notes |
|---|---|---|
| `goto(url, options?)` | ✅ | |
| `reload(options?)` | ✅ | |
| `goBack(options?)` | ✅ | |
| `goForward(options?)` | ✅ | |
| `url()` | ✅ | |
| `title()` | ✅ | |
| `content()` | ✅ | |
| `screenshot(options?)` | ✅ | via modern-screenshot |
| `locator(selector)` | ✅ | |
| `getByRole(role, options?)` | ✅ | |
| `getByText(text)` | ✅ | |
| `getByLabel(text)` | ✅ | |
| `getByPlaceholder(text)` | ✅ | |
| `getByTestId(id)` | ✅ | |
| `click(selector, options?)` | ✅ | |
| `fill(selector, value, options?)` | ✅ | |
| `type(selector, text, options?)` | ✅ | |
| `selectOption(selector, values)` | ✅ | |
| `check(selector)` | ✅ | |
| `uncheck(selector)` | ✅ | |
| `hover(selector, options?)` | ✅ | |
| `focus(selector)` | ✅ | |
| `waitForSelector(selector, options?)` | ✅ | |
| `waitForTimeout(ms)` | ✅ | |
| `waitForLoadState(state?)` | ✅ | |
| `waitForURL(url, options?)` | ✅ | |
| `evaluate(fn, ...args)` | ✅ | |
| `evaluateHandle(fn, ...args)` | ✅ | |
| `route(pattern, handler, options?)` | ✅ | |
| `unroute(pattern?, handler?)` | ✅ | |
| `addInitScript(script, arg?)` | ✅ | |
| `addLocatorHandler(locator, handler)` | ✅ | |
| `addScriptTag(options)` | ✅ | |
| `addStyleTag(options)` | ✅ | |
| `scrollTo(x, y)` | ✅ | |
| `close()` | ✅ | |
| `on(event, listener)` / `once` / `off` | ✅ | console, dialog, load, request, … |
| `setDefaultTimeout(ms)` | ✅ | |
| `setDefaultNavigationTimeout(ms)` | ❌ | navigation-specific timeout |
| `setViewportSize(size)` | ❌ | resize viewport |
| `viewportSize()` | ❌ | return current size |
| `bringToFront()` | ❌ | OS-level window focus |
| `setExtraHTTPHeaders(headers)` | ✅ | patches XHR + fetch browser-side |
| `dispatchEvent(selector, type, init?)` | ✅ | |
| `dragAndDrop(source, target)` | ✅ | |
| `tap(selector)` | ❌ | touch tap |
| `exposeFunction(name, fn)` | ✅ | browser calls Node.js fn via bridge |
| `exposeBinding(name, fn)` | ❌ | expose with binding source |
| `emulateMedia(params)` | ❌ | media type / color scheme |
| `frames()` | ❌ | list of Frame objects |
| `mainFrame()` | ❌ | main Frame object |
| `workers()` | ❌ | list of Worker objects |
| `pause()` | ❌ | debugger pause |
| `pdf(options?)` | ❌ | PDF export (Chrome-only, N/A for Safari) |

### Locator

| Method | Status | Notes |
|---|---|---|
| `click(options?)` | ✅ | |
| `dblclick(options?)` | ✅ | |
| `fill(value, options?)` | ✅ | |
| `type(text, options?)` | ✅ | |
| `clear(options?)` | ✅ | |
| `pressSequentially(text, options?)` | ✅ | delegates to `type` |
| `hover(options?)` | ✅ | |
| `focus(options?)` | ✅ | |
| `blur(options?)` | ✅ | |
| `scrollIntoViewIfNeeded(options?)` | ✅ | |
| `selectOption(values, options?)` | ✅ | |
| `check(options?)` | ✅ | |
| `uncheck(options?)` | ✅ | |
| `isVisible()` | ✅ | |
| `isHidden()` | ✅ | |
| `isEnabled()` | ✅ | |
| `isDisabled()` | ✅ | |
| `isChecked()` | ✅ | |
| `isEditable()` | ✅ | |
| `textContent()` | ✅ | |
| `innerText()` | ✅ | |
| `innerHTML()` | ✅ | |
| `inputValue()` | ✅ | |
| `getAttribute(name)` | ✅ | |
| `waitFor(options?)` | ✅ | |
| `count()` | ✅ | |
| `nth(index)` | ✅ | |
| `first()` | ✅ | |
| `last()` | ✅ | |
| `locator(subSelector)` | ✅ | |
| `evaluate(fn, ...args)` | ✅ | |
| `press(key)` | ✅ | |
| `setChecked(checked, options?)` | ✅ | |
| `dispatchEvent(type, init?)` | ✅ | |
| `dragTo(target, options?)` | ✅ | |
| `tap(options?)` | ❌ | touch tap |
| `selectText(options?)` | ❌ | select all text in element |
| `setInputFiles(files, options?)` | ❌ | file upload |
| `boundingBox(options?)` | ✅ | |
| `screenshot(options?)` | ✅ | via modern-screenshot |
| `filter(options)` | ✅ | hasText, hasNotText, has, hasNot |
| `and(locator)` | ✅ | |
| `or(locator)` | ✅ | |
| `all()` | ✅ | |
| `allTextContents()` | ✅ | |
| `allInnerTexts()` | ✅ | |
| `evaluateAll(fn, ...args)` | ✅ | |
| `elementHandle()` | ❌ | returns ElementHandle (legacy) |
