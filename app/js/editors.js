/**
 *  RxJS in action
 *  Chapter #
 *  @author Paul Daniels
 *  @author Luis Atencio
 */
'use strict';
const runtime$ = (function() {

  function buildTag(tagName, options, transform = x => x) {
    return (source) => {
      const attrs = [];
      for (let k in options) {
        options.hasOwnProperty(k) && attrs.push(`${k}=${options[k]}`);
      }

      return `<${tagName} ${attrs.join(' ')}>${transform(source)}</${tagName}>`;
    };
  }

  const defaultHtml =
`
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>RxJS in Action</title>
  </head>
  <body></body>
</html>
`.trim();

  Rx.Observable.of('css', 'html', 'javascript')
    .flatMap(
      tag => Rx.Observable.fromEvent(document.getElementById('show-' + tag), 'click'),
      (tag, value) => ({tag, el: value.target}))
    .subscribe(({el, tag}) => {
      const {classList, id} = el;

      classList.toggle('btn-primary');
      classList.toggle('btn-default');
      classList.toggle('active');


      document.getElementById(tag + '-container').classList.toggle('hidden');
    });

  // Builds a new code editor on the page
  const jsEditor = CodeMirror.fromTextArea(document.getElementById('javascript'), {
    mode: "javascript",
    theme: 'dracula',
    lineNumbers: true,
    readOnly: false,
    value: 'Test'
  });

  const htmlEditor = CodeMirror.fromTextArea(document.getElementById('html'), {
    mode: 'htmlmixed',
    theme: 'dracula',
    lineNumbers: true,
  });

  htmlEditor.setValue(defaultHtml);

  const cssEditor = CodeMirror.fromTextArea(document.getElementById('css'), {
    mode: 'css',
    theme: 'dracula',
    lineNumbers: true
  });

  const exampleSelector = document.getElementById('example-change');

  const urlParams = getUrlParams(window.location.search);

  Rx.Observable.from(exampleSelector.getElementsByTagName('option'))
    .filter(({value}) => value === urlParams['example'])
    .take(1)
    .subscribe(x => x.selected = 'selected');

  const startWithIfPresent = (url, key) => source =>
    url[key] ? source.startWith(url[key]) : source;

  Rx.Observable.fromEvent(
    exampleSelector,
    'change',
    (e) => e.target.value
  )
    .let(startWithIfPresent(urlParams, 'example'))
    .map((e) => e.split('.')) // Split the chapter and id
    .filter(value => value.length === 2) // Sanity check
    .flatMap(([chapter, id]) => {
      return $.getJSON(`/rest/api/example/${chapter}/${id}`);
    })
    .subscribe(({js, css, html}) => {
      js && jsEditor.setValue(js);
      css && cssEditor.setValue(css);
      html && htmlEditor.setValue(html);
    });

  const onCodeChange = (tag) => () => {
    console.log(tag, '[UPDATE]: CODE CHANGE', Date.now());
  };

  const html$ = Rx.Observable.fromEvent(htmlEditor.doc, 'change',
    (instance, change) => instance.getValue())
    .do(onCodeChange('html'))
    .startWith(defaultHtml)
    .debounceTime(1000);

  // Babel compiler options
  const compile$ = Rx.Observable.of({
      presets: ['es2015'],
      // TODO Compile this separately and load independently
      plugins: [
        ["transform-object-rest-spread", { "useBuiltIns": true }]
      ]
    });

  const js$ = Rx.Observable.fromEvent(jsEditor, 'change',
    (instance, change) => instance.getValue())
    .do(onCodeChange('js'))
    .startWith('console.log("Welcome to RxJS in Action Code!")')
    .debounceTime(1000)
    .do(() => console.log('Compiling...'))
    .combineLatest(compile$, (code, opts) => {
      try {
        return Babel.transform(code, opts).code
      } catch (e) {
        console.warn('Problem compiling the code', e);
        //FIXME Probably should not be returning code that babel doesn't even know how to compile
        return code;
      }
    })
    .map(buildTag('script', {type: 'application/javascript'}, function(code) {
      //Naive way of preventing this from polluting the global namespace
      return `(${consoleProxy.toString().trim()})();(function wrapper() {${code}})()`;
    }));

  const css$ = Rx.Observable.fromEvent(cssEditor, 'change',
    (instance, change) => instance.getValue())
    .do(onCodeChange('css'))
    .startWith('')
    .debounceTime(1000)
    .map(buildTag('style'));

  const update$ = js$.combineLatest(html$, css$,
    (javascript, html, css) => ({html, javascript, css}));

  return update$
    .throttleTime(1000)
    .do(onCodeChange('combined'))
    .map(contents => {
      const {javascript, html, css} = contents;
      let builder = [];

      try {
        const endOfHead = html.indexOf('</head>');
        const endOfBody = html.indexOf('</body>');

        const beforeCss = html.substring(0, endOfHead);
        const afterCss = html.substring(endOfHead, endOfBody);
        const afterJs = html.substring(endOfBody);

        builder.push(beforeCss);
        builder.push(css);
        builder.push(afterCss);

        builder.push(javascript);
        builder.push(afterJs);
      } catch (e) {
        console.log('Could not render content! ', e);
      }

      return builder.join('\n');
    });
})();
