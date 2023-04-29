import { assertEquals,  } from "https://deno.land/std@0.185.0/testing/asserts.ts";

import { scrape, get, select, scope, all, constant, flatten, entries } from '../mod.ts';

Deno.test('get', async () => {
    const result = await scrape(`<h1>TEST</h1>`, get('h1'));
    assertEquals(result, 'TEST');
})

Deno.test('select', async () => {
    const result = await scrape(`<h1>TEST</h1>`, select('h1'));
    assertEquals(result, ['TEST']);
})

Deno.test('select + textContent', async () => {
    const result = await scrape(`<h1>TEST</h1>`, select('h1').textContent());
    assertEquals(result, ['TEST']);
})

Deno.test('select + attribute', async () => {
    const result = await scrape(`<h1 data-test="ATTRIBUTE">TEST</h1>`, select('h1').attr('data-test'));
    assertEquals(result, ['ATTRIBUTE']);
})

Deno.test('select + innerHTML', async () => {
    const result = await scrape(`<h1>TEST<br>TEST</h1>`, select('h1').innerHTML());
    assertEquals(result, ['TEST<br>TEST']);
})

Deno.test('select + outerHTML', async () => {
    const result = await scrape(`<main><h1>TEST<br>TEST</h1></main>`, select('h1').outerHTML());
    assertEquals(result, ['<h1>TEST<br>TEST</h1>']);
})

Deno.test('select + single', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1>`, select('h1').single());
    assertEquals(result, 'TEST');
})

Deno.test('object + select', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1>`, { h1s: select('h1') });
    assertEquals(result, { h1s: 'TEST'  });
})

Deno.test('object + all', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1>`, { h1s: all('h1') });
    assertEquals(result, { h1s: ['TEST', 'TEST2']  });
})

Deno.test('object + select + range', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1><h1>TEST3</h1><h1>TEST4</h1>`, {
        range: select('h1').range(1, 3),
    });
    assertEquals(result, { range: ['TEST2', 'TEST3'] });
})

Deno.test('object + select + first & last', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1><h1>TEST3</h1>`, {
        first: select('h1').first(),
        last: select('h1').last()
    });
    assertEquals(result, { first: 'TEST', last: 'TEST3'  });
})

Deno.test('array + select', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1><h1>TEST3</h1>`, [select('h1')]);
    assertEquals(result, ['TEST', 'TEST2', 'TEST3']);
})

Deno.test('tuple + select', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1><h2>TEST3</h2>`, [select('h1'), select('h2')]);
    assertEquals(result, ['TEST', 'TEST3']);
})

Deno.test('scope', async () => {
    const result = await scrape(`
        <section>
            <h1>TEST</h1>
        </section>
        <h1>OUTSIDE</h1>
    `, scope('section', select('h1')));
    assertEquals(result, ['TEST']);
})

// TODO
Deno.test('scope + array', async () => {
    const result = await scrape(`
        <section>
            <h1>TEST</h1>
        </section>
        <section>
            <h1>TEST2</h1>
        </section>
        <h1>OUTSIDE</h1>
    `, scope('section', [select('h1').single()])); // TODO
    assertEquals(result, ['TEST', 'TEST2']);
})

Deno.test('scope + global', async () => {
    const result = await scrape(`
        <section>
            <h1>TEST</h1>
        </section>
        <h1>OUTSIDE</h1>
    `, scope('section', select('h1').fromGlobal()));
    assertEquals(result, ['TEST', 'OUTSIDE']);
})

Deno.test('scope + scope', async () => {
    const result = await scrape(`
        <article>
            <section>
                <h1>TEST</h1>
                <h1>TEST2</h1>
            </section>
            <h1>OUTSIDE2</h1>
        </article>
        <h1>OUTSIDE</h1>
    `, scope('article', scope('section', select('h1'))));
    assertEquals(result, ['TEST', 'TEST2']);
})

// TODO: scope nesting + array

Deno.test('scope + select', async () => {
    const result = await scrape(`
        <main>
            <h1>A</h1>
            <h1>B</h1>
        </main>
        <main>
            <h1>C</h1>
            <h1>D</h1>
        </main>
    `, { main_h1: scope('main', [select('h1')]) });
    assertEquals(result, { main_h1: ['A', 'B', 'C', 'D'] });
})

Deno.test('str', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1>`, 'h1');
    assertEquals(result, 'TEST');
})

Deno.test('str + array', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1>`, ['h1']);
    assertEquals(result, ['TEST', 'TEST2']);
})

Deno.test('str + tuple', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1><h3>TEST3</h3>`, ['h1', 'h3']);
    assertEquals(result, ['TEST', 'TEST3']);
})

Deno.test('str + object', async () => {
    const result = await scrape(`<h1>TEST</h1><h1>TEST2</h1>`, { h1: 'h1' });
    assertEquals(result, { h1: 'TEST' });
})

Deno.test('str + html', async () => {
    const result = await scrape(`<h1>TEST<br>TEST</h1>`, 'h1@html');
    assertEquals(result, 'TEST<br>TEST');
})

Deno.test('str + attribute', async () => {
    const result = await scrape(`<h1 data-test="ATTRIBUTE">TEST<br>TEST</h1>`, 'h1@data-test');
    assertEquals(result, 'ATTRIBUTE');
})

Deno.test('constant', async () => {
    const result = await scrape(`<h1>TEST</h1>`, constant('test'));
    assertEquals(result, 'test');
})

Deno.test('object + constant', async () => {
    const result = await scrape(`<h1>TEST</h1>`, { test: constant('test') });
    assertEquals(result, { test: 'test' });
})

Deno.test('array + constant', async () => {
    const result = await scrape(`<h1>TEST</h1>`, [constant('test')]);
    assertEquals(result, ['test']);
})

Deno.test('array + constant + array', async () => {
    const result = await scrape(`<h1>TEST</h1>`, [constant(['test'])]);
    assertEquals(result, [['test']]);
})

Deno.test('flatten', async () => {
    const result = await scrape(`<h1>TEST</h1>`, flatten(constant([1, [2, 3], [4, 5]])));
    assertEquals(result, [1, 2, 3, 4, 5]);
})

Deno.test('entries', async () => {
    const result = await scrape(`
        <main>
            <h1>One</h1>
            <ul>
                <li>Apple</li>
                <li>Orange</li>
            </ul>
        </main>
        <main>
            <h1>Two</h1>
            <ul>
                <li>Banana</li>
                <li>Grape</li>
            </ul>
        </main>
    `, entries(scope('main', [ [get('h1'), { items: ['li'] }] ] )) );
    assertEquals(result, { 
        'One': { items: ['Apple', 'Orange'] },
        'Two': { items: ['Banana', 'Grape'] }
    });
})