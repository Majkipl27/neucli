/**
 * Ready-made components: layouts (AppShell) and blocks.
 *
 * A preset is plain format data, the same `components:` entries a person
 * would write. Inserting one copies its definitions into a config (see
 * `insertPreset`), after which they're ordinary components the user owns and
 * edits. Colors are Tailwind palette values only, so presets work with any
 * theme.
 */

import type { ComponentDef, Config, Node } from '../types.ts';
import { isInstance } from '../types.ts';

export interface Preset {
  id: string;
  /** Component name it's inserted under (renamed on a clash). */
  name: string;
  label: string;
  kind: 'layout' | 'block';
  description: string;
  /** The preset's own definition plus any components it uses, main one first. */
  components: Record<string, ComponentDef>;
}

const link = (content: string, href: string): Node => ({ type: 'link', href, content, className: 'hover:opacity-70 transition-opacity' } as Node);

// --- blocks -------------------------------------------------------------------

const Navbar: ComponentDef = {
  props: { brand: { type: 'text', default: 'Brand' } },
  root: {
    type: 'frame',
    tag: 'nav',
    layout: { direction: 'row', justify: 'between', align: 'center', padding: [16, 32] },
    fill: 'white',
    color: 'slate-900',
    border: { color: 'slate-200', sides: 'bottom' },
    responsive: { phone: { layout: { padding: [12, 16] } } },
    children: [
      { type: 'link', href: '/', content: '{brand}', font: { size: 18, weight: 700 } },
      {
        type: 'frame',
        layout: { direction: 'row', gap: 24, align: 'center' },
        color: 'slate-600',
        font: { size: 14 },
        responsive: { phone: { layout: { gap: 16 } } },
        children: [link('Home', '/'), link('About', '/about'), link('Contact', '/contact'), { type: 'slot', name: 'actions' }],
      },
    ],
  } as Node,
};

const Footer: ComponentDef = {
  props: { brand: { type: 'text', default: 'Brand' } },
  root: {
    type: 'frame',
    tag: 'footer',
    layout: { direction: 'row', justify: 'between', align: 'center', padding: [32, 32] },
    color: 'slate-500',
    font: { size: 14 },
    border: { color: 'slate-200', sides: 'top' },
    responsive: { phone: { layout: { direction: 'column', align: 'start', gap: 12, padding: [24, 16] } } },
    children: [
      { type: 'text', content: '© 2026 {brand}' },
      {
        type: 'frame',
        layout: { direction: 'row', gap: 16 },
        children: [link('Privacy', '/privacy'), link('Terms', '/terms')],
      },
    ],
  } as Node,
};

const Hero: ComponentDef = {
  props: {
    title: { type: 'text', default: 'Say what you make in one line' },
    subtitle: { type: 'text', default: 'A sentence or two on who it is for and why it beats what they use now.' },
  },
  root: {
    type: 'frame',
    tag: 'section',
    layout: { align: 'center', gap: 20, padding: [96, 24] },
    responsive: { phone: { layout: { padding: [64, 16] } } },
    children: [
      {
        type: 'text', tag: 'h1', content: '{title}', maxWidth: 768,
        font: { size: 48, weight: 700, tracking: -0.025, align: 'center', leading: 1.1 },
        responsive: { phone: { font: { size: 36 } } },
      },
      { type: 'text', content: '{subtitle}', maxWidth: 640, color: 'slate-600', font: { size: 18, align: 'center' } },
      {
        type: 'frame',
        layout: { direction: 'row', gap: 12, justify: 'center', wrap: true, padding: [8, 0, 0, 0] },
        children: [{ type: 'slot' }],
      },
    ],
  } as Node,
};

const Section: ComponentDef = {
  props: { title: { type: 'text', default: 'Section title' } },
  root: {
    type: 'frame',
    tag: 'section',
    layout: { align: 'center', padding: [80, 32] },
    responsive: { phone: { layout: { padding: [56, 16] } } },
    children: [
      {
        type: 'frame',
        width: 'fill',
        maxWidth: 1152,
        layout: { gap: 32 },
        children: [
          { type: 'text', tag: 'h2', content: '{title}', font: { size: 32, weight: 700, tracking: -0.025 } },
          { type: 'slot' },
        ],
      },
    ],
  } as Node,
};

const Card: ComponentDef = {
  props: {
    title: { type: 'text', default: 'Card title' },
    body: { type: 'text', default: 'One or two sentences about this item.' },
  },
  root: {
    type: 'frame',
    layout: { gap: 8, padding: 24 },
    fill: 'white',
    radius: 12,
    border: { color: 'slate-200' },
    children: [
      { type: 'text', tag: 'h3', content: '{title}', font: { size: 18, weight: 600 } },
      { type: 'text', content: '{body}', color: 'slate-600' },
      { type: 'slot' },
    ],
  } as Node,
};

const Button: ComponentDef = {
  props: {
    label: { type: 'text', default: 'Get started' },
    href: { type: 'url', default: '/' },
  },
  root: {
    type: 'link',
    href: '{href}',
    content: '{label}',
    layout: { align: 'center', padding: [10, 18] },
    fill: 'slate-900',
    color: 'white',
    radius: 8,
    font: { size: 14, weight: 600 },
    className: 'hover:opacity-90 transition-opacity',
  } as Node,
};

const Stat: ComponentDef = {
  props: {
    value: { type: 'text', default: '42%' },
    label: { type: 'text', default: 'What the number means' },
  },
  root: {
    type: 'frame',
    layout: { gap: 4, padding: 20 },
    fill: 'white',
    radius: 12,
    border: { color: 'slate-200' },
    children: [
      { type: 'text', content: '{label}', color: 'slate-500', font: { size: 14 } },
      { type: 'text', content: '{value}', font: { size: 30, weight: 700, tracking: -0.025 } },
    ],
  } as Node,
};


// --- interactive blocks ---------------------------------------------------------

const AccordionItem: ComponentDef = {
  props: {
    question: { type: 'text', default: 'A question people ask before buying' },
    answer: { type: 'text', default: 'A short, direct answer. Two sentences at most.' },
  },
  root: {
    type: 'frame',
    state: { open: false },
    border: { color: 'slate-200', sides: 'bottom' },
    children: [
      {
        type: 'frame',
        tag: 'button',
        on: { click: 'toggle open' },
        width: 'fill',
        layout: { direction: 'row', justify: 'between', align: 'center', gap: 16, padding: [16, 0] },
        font: { size: 16, weight: 600, align: 'left' },
        className: 'cursor-pointer',
        children: [
          { type: 'text', tag: 'span', content: '{question}' },
          {
            type: 'text', tag: 'span', content: '+', color: 'slate-400', font: { size: 20 },
            attrs: { 'aria-hidden': 'true' },
            className: 'transition-transform',
            when: { open: { className: 'rotate-45' } },
          },
        ],
      },
      {
        type: 'frame',
        visibleWhen: 'open',
        layout: { padding: [0, 0, 16, 0] },
        color: 'slate-600',
        children: [{ type: 'text', content: '{answer}' }],
      },
    ],
  } as Node,
};

const Accordion: ComponentDef = {
  root: {
    type: 'frame',
    width: 'fill',
    maxWidth: 768,
    border: { color: 'slate-200', sides: 'top' },
    children: [
      { type: 'AccordionItem', props: { question: 'How long does setup take?', answer: 'About ten minutes: write the YAML, run the generator, deploy the build folder.' } },
      { type: 'AccordionItem', props: { question: 'Can I edit the generated code?', answer: 'Yes. It is plain React and Tailwind, so you can take it from there.' } },
      { type: 'AccordionItem', props: { question: 'Does it work without JavaScript?', answer: 'The pages render with React, so JavaScript is required.' } },
    ],
  } as Node,
};

const tabButton = (label: string, i: number): Node => ({
  type: 'frame',
  tag: 'button',
  on: { click: `set tab ${i}` },
  attrs: { role: 'tab', 'aria-selected': `{tab == ${i}}` },
  layout: { padding: [10, 14] },
  color: 'slate-500',
  font: { size: 14, weight: 500 },
  border: { width: 2, color: 'transparent', sides: 'bottom' },
  className: '-mb-px cursor-pointer hover:text-slate-900 transition-colors',
  when: { [`tab == ${i}`]: { color: 'slate-900', border: { color: 'slate-900' } } },
  children: [{ type: 'text', tag: 'span', content: label }],
} as Node);

const tabPanel = (i: number, title: string, body: string): Node => ({
  type: 'frame',
  visibleWhen: `tab == ${i}`,
  attrs: { role: 'tabpanel' },
  layout: { gap: 8 },
  children: [
    { type: 'text', tag: 'h3', content: title, font: { size: 18, weight: 600 } },
    { type: 'text', content: body, color: 'slate-600' },
  ],
} as Node);

const Tabs: ComponentDef = {
  root: {
    type: 'frame',
    state: { tab: 0 },
    width: 'fill',
    layout: { gap: 20 },
    children: [
      {
        type: 'frame',
        attrs: { role: 'tablist' },
        layout: { direction: 'row', gap: 4 },
        border: { color: 'slate-200', sides: 'bottom' },
        children: [tabButton('Overview', 0), tabButton('Pricing', 1), tabButton('FAQ', 2)],
      },
      tabPanel(0, 'Overview', 'What it is and who it is for, in a paragraph.'),
      tabPanel(1, 'Pricing', 'Free for one project. Teams pay per seat, monthly or yearly.'),
      tabPanel(2, 'FAQ', 'Put the questions people ask in sales calls here.'),
    ],
  } as Node,
};

const SLIDE_FILLS: [string, string][] = [['indigo-500', 'violet-600'], ['sky-500', 'indigo-600'], ['emerald-500', 'teal-600']];

const Carousel: ComponentDef = {
  root: {
    type: 'frame',
    state: { slide: 0 },
    width: 'fill',
    layout: { gap: 16 },
    attrs: { 'aria-roledescription': 'carousel' },
    children: [
      {
        type: 'frame',
        name: 'Slides',
        height: 320,
        radius: 12,
        clip: true,
        attrs: { 'aria-live': 'polite' },
        responsive: { phone: { height: 220 } },
        children: SLIDE_FILLS.map(([from, to], i) => ({
          type: 'frame',
          name: `Slide ${i + 1}`,
          visibleWhen: `slide == ${i}`,
          height: 'fill',
          layout: { align: 'center', justify: 'center' },
          fill: { gradient: 'to-br', from, to },
          color: 'white',
          attrs: { 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of 3` },
          children: [{ type: 'text', content: `Slide ${i + 1}`, font: { size: 32, weight: 700 } }],
        })) as Node[],
      },
      {
        type: 'frame',
        name: 'Controls',
        layout: { direction: 'row', justify: 'between', align: 'center' },
        children: [
          {
            type: 'frame', tag: 'button', on: { click: 'prev slide of 3' }, attrs: { 'aria-label': 'Previous slide' },
            layout: { padding: [8, 14] }, radius: 8, border: { color: 'slate-300' }, font: { size: 14, weight: 500 },
            className: 'cursor-pointer hover:bg-slate-50',
            children: [{ type: 'text', tag: 'span', content: 'Previous' }],
          },
          {
            type: 'frame',
            name: 'Dots',
            layout: { direction: 'row', gap: 8, align: 'center' },
            children: [0, 1, 2].map(i => ({
              type: 'frame', tag: 'button', on: { click: `set slide ${i}` },
              attrs: { 'aria-label': `Go to slide ${i + 1}`, 'aria-current': `{slide == ${i}}` },
              width: 10, height: 10, radius: 'full', fill: 'slate-300',
              className: 'cursor-pointer',
              when: { [`slide == ${i}`]: { fill: 'slate-900' } },
            })) as Node[],
          },
          {
            type: 'frame', tag: 'button', on: { click: 'next slide of 3' }, attrs: { 'aria-label': 'Next slide' },
            layout: { padding: [8, 14] }, radius: 8, border: { color: 'slate-300' }, font: { size: 14, weight: 500 },
            className: 'cursor-pointer hover:bg-slate-50',
            children: [{ type: 'text', tag: 'span', content: 'Next' }],
          },
        ],
      },
    ],
  } as Node,
};

const Modal: ComponentDef = {
  props: {
    label: { type: 'text', default: 'Open dialog' },
    title: { type: 'text', default: 'Dialog title' },
    body: { type: 'text', default: 'Say what happens next and what the person needs to decide.' },
  },
  root: {
    type: 'frame',
    state: { open: false },
    layout: { align: 'start' },
    children: [
      {
        type: 'frame', tag: 'button', on: { click: 'set open true' },
        layout: { padding: [10, 18] }, fill: 'slate-900', color: 'white', radius: 8, font: { size: 14, weight: 600 },
        className: 'cursor-pointer hover:opacity-90',
        children: [{ type: 'text', tag: 'span', content: '{label}' }],
      },
      {
        type: 'frame',
        tag: 'dialog',
        visibleWhen: 'open',
        width: 480,
        maxWidth: '90%',
        layout: { gap: 12, padding: 24 },
        fill: 'white',
        color: 'slate-900',
        radius: 12,
        shadow: 'xl',
        attrs: { 'aria-labelledby': 'modal-title' },
        className: 'm-auto backdrop:bg-slate-950/50',
        children: [
          { type: 'text', tag: 'h2', id: 'modal-title', content: '{title}', font: { size: 20, weight: 600 } },
          { type: 'text', content: '{body}', color: 'slate-600' },
          {
            type: 'frame',
            layout: { direction: 'row', justify: 'end', padding: [8, 0, 0, 0] },
            children: [
              {
                type: 'frame', tag: 'button', on: { click: 'set open false' },
                layout: { padding: [8, 14] }, radius: 8, border: { color: 'slate-300' }, font: { size: 14, weight: 500 },
                className: 'cursor-pointer hover:bg-slate-50',
                children: [{ type: 'text', tag: 'span', content: 'Close' }],
              },
            ],
          },
        ],
      },
    ],
  } as Node,
};

// --- layouts ------------------------------------------------------------------

const Marketing: ComponentDef = {
  root: {
    type: 'frame',
    minHeight: 'screen',
    fill: 'white',
    color: 'slate-900',
    children: [
      { type: 'Navbar' },
      { type: 'frame', tag: 'main', height: 'fill', children: [{ type: 'slot' }] },
      { type: 'Footer' },
    ],
  } as Node,
};

const sideLink = (content: string, href: string): Node =>
  ({ type: 'link', href, content, layout: { padding: [8, 12] }, radius: 6, className: 'hover:bg-white/10 transition-colors' } as Node);

/** Brand line at the top of a sidebar; on phone it takes its own row above the links. */
const brandBlock: Node = {
  type: 'frame',
  layout: { padding: [0, 12, 16, 12] },
  // On phone the links sit in a row beside it with 8px padding; match it so the baselines line up.
  responsive: { phone: { layout: { padding: [8, 12] } } },
  children: [{ type: 'text', content: '{brand}', color: 'white', font: { size: 16, weight: 700 } }],
} as Node;

const SidebarApp: ComponentDef = {
  props: {
    brand: { type: 'text', default: 'Brand' },
    title: { type: 'text', default: 'Overview' },
  },
  root: {
    type: 'frame',
    // On phone the sidebar hides behind a Menu button in the header.
    state: { menu: false },
    layout: { direction: 'row' },
    minHeight: 'screen',
    fill: 'slate-50',
    color: 'slate-900',
    responsive: { phone: { layout: { direction: 'column' } } },
    children: [
      {
        type: 'frame',
        tag: 'aside',
        name: 'Sidebar',
        width: 240,
        layout: { gap: 4, padding: [24, 16] },
        fill: 'slate-900',
        color: 'slate-300',
        font: { size: 14 },
        responsive: { phone: { width: 'fill', hidden: true, layout: { direction: 'row', gap: 4, padding: [12, 16], wrap: true } } },
        when: { menu: { hidden: false } },
        children: [
          brandBlock,
          sideLink('Overview', '/app'),
          sideLink('Projects', '/app/projects'),
          sideLink('Settings', '/app/settings'),
        ],
      },
      {
        type: 'frame',
        name: 'Main',
        width: 'fill',
        children: [
          {
            type: 'frame',
            tag: 'header',
            layout: { direction: 'row', align: 'center', justify: 'between', padding: [16, 32] },
            fill: 'white',
            border: { color: 'slate-200', sides: 'bottom' },
            responsive: { phone: { layout: { padding: [12, 16] } } },
            children: [
              { type: 'text', tag: 'h1', content: '{title}', font: { size: 20, weight: 600 } },
              {
                type: 'frame', tag: 'button', on: { click: 'toggle menu' },
                hidden: true,
                responsive: { phone: { hidden: false } },
                layout: { padding: [6, 12] }, radius: 6, border: { color: 'slate-300' }, font: { size: 14, weight: 500 },
                className: 'cursor-pointer',
                children: [{ type: 'text', tag: 'span', content: 'Menu' }],
              },
            ],
          },
          {
            type: 'frame',
            tag: 'main',
            height: 'fill',
            layout: { gap: 24, padding: 32 },
            responsive: { phone: { layout: { padding: 16 } } },
            children: [{ type: 'slot' }],
          },
        ],
      },
    ],
  } as Node,
};

const Dashboard: ComponentDef = {
  props: {
    brand: { type: 'text', default: 'Brand' },
    title: { type: 'text', default: 'Dashboard' },
  },
  root: {
    type: 'frame',
    layout: { direction: 'row' },
    minHeight: 'screen',
    fill: 'slate-100',
    color: 'slate-900',
    responsive: { phone: { layout: { direction: 'column' } } },
    children: [
      {
        type: 'frame',
        tag: 'aside',
        name: 'Sidebar',
        width: 220,
        layout: { gap: 4, padding: [20, 12] },
        fill: 'slate-950',
        color: 'slate-400',
        font: { size: 14 },
        responsive: {
          tablet: { width: 180 },
          phone: { width: 'fill', layout: { direction: 'row', padding: [12, 16], wrap: true } },
        },
        children: [
          brandBlock,
          sideLink('Dashboard', '/dashboard'),
          sideLink('Reports', '/dashboard/reports'),
          sideLink('Customers', '/dashboard/customers'),
          sideLink('Settings', '/dashboard/settings'),
        ],
      },
      {
        type: 'frame',
        name: 'Main',
        width: 'fill',
        children: [
          {
            type: 'frame',
            tag: 'header',
            layout: { direction: 'row', align: 'center', justify: 'between', gap: 16, padding: [12, 24] },
            fill: 'white',
            border: { color: 'slate-200', sides: 'bottom' },
            responsive: { phone: { layout: { padding: [12, 16] } } },
            children: [
              { type: 'text', tag: 'h1', content: '{title}', font: { size: 18, weight: 600 } },
              {
                type: 'input', field: 'search', inputType: 'search', placeholder: 'Search', width: 240,
                radius: 6, border: { color: 'slate-300' }, font: { size: 14 },
                className: 'px-3 py-1.5',
                responsive: { phone: { hidden: true } },
              },
            ],
          },
          {
            // No height: fill here: a grid that tall would stretch its rows apart.
            type: 'frame',
            tag: 'main',
            layout: { direction: 'grid', columns: 3, gap: 24, padding: 24, align: 'start' },
            responsive: {
              tablet: { layout: { columns: 2 } },
              phone: { layout: { columns: 1, gap: 16, padding: 16 } },
            },
            children: [{ type: 'slot' }],
          },
        ],
      },
    ],
  } as Node,
};

export const PRESETS: Preset[] = [
  { id: 'marketing', name: 'Marketing', label: 'Marketing', kind: 'layout', description: 'Navbar, page content, footer.', components: { Marketing, Navbar, Footer } },
  { id: 'sidebar-app', name: 'SidebarApp', label: 'Sidebar app', kind: 'layout', description: 'Fixed sidebar nav, header, content. On phone a Menu button opens the nav.', components: { SidebarApp } },
  { id: 'dashboard', name: 'Dashboard', label: 'Dashboard', kind: 'layout', description: 'Sidebar, top bar with search, content grid.', components: { Dashboard } },
  { id: 'navbar', name: 'Navbar', label: 'Navbar', kind: 'block', description: 'Brand, links and an actions slot.', components: { Navbar } },
  { id: 'hero', name: 'Hero', label: 'Hero', kind: 'block', description: 'Big title, subtitle, a slot for buttons.', components: { Hero } },
  { id: 'section', name: 'Section', label: 'Section', kind: 'block', description: 'Titled, centered section with a slot.', components: { Section } },
  { id: 'card', name: 'Card', label: 'Card', kind: 'block', description: 'Title, body and a slot.', components: { Card } },
  { id: 'button', name: 'Button', label: 'Button', kind: 'block', description: 'Link styled as a button.', components: { Button } },
  { id: 'stat', name: 'Stat', label: 'Stat', kind: 'block', description: 'A number with a label.', components: { Stat } },
  { id: 'footer', name: 'Footer', label: 'Footer', kind: 'block', description: 'Copyright line and links.', components: { Footer } },
  { id: 'accordion', name: 'Accordion', label: 'Accordion', kind: 'block', description: 'FAQ items that open and close.', components: { Accordion, AccordionItem } },
  { id: 'tabs', name: 'Tabs', label: 'Tabs', kind: 'block', description: 'Three tabs with panels.', components: { Tabs } },
  { id: 'carousel', name: 'Carousel', label: 'Carousel', kind: 'block', description: 'Slides with previous, next and dots.', components: { Carousel } },
  { id: 'modal', name: 'Modal', label: 'Modal', kind: 'block', description: 'A button that opens a dialog. Esc closes it.', components: { Modal } },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find(p => p.id === id);
}

// --- inserting ----------------------------------------------------------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Point instance types at renamed components, everywhere in a tree. */
function renameRefs(node: Node, names: Record<string, string>): Node {
  const out = node as unknown as Record<string, unknown>;
  if (isInstance(node) && names[node.type]) out.type = names[node.type];
  if (Array.isArray(out.children)) out.children = (out.children as Node[]).map(c => renameRefs(c, names));
  if (out.slots && typeof out.slots === 'object') {
    for (const [k, list] of Object.entries(out.slots as Record<string, Node[]>)) {
      (out.slots as Record<string, Node[]>)[k] = list.map(c => renameRefs(c, names));
    }
  }
  return node;
}

function freeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface InsertedPreset {
  config: Config;
  /** The preset's main component name in the config. */
  name: string;
  /** Preset name -> name used in the config, for every component involved. */
  names: Record<string, string>;
}

/**
 * Copy a preset's components into `config.components`. A component that's
 * already there with an identical definition (under any name, say `Navbar2`
 * from an earlier insert) is reused. Otherwise the preset's name is used, or
 * a free one (`Navbar2`) when it's taken, and references inside the copied
 * definitions follow the rename.
 */
export function insertPreset(config: Config, id: string): InsertedPreset | null {
  const preset = getPreset(id);
  if (!preset) return null;
  const existing = config.components ?? {};
  const taken = new Set(Object.keys(existing));
  const names: Record<string, string> = {};
  const components: Record<string, ComponentDef> = { ...existing };

  // Dependencies come after the main component, so walk backwards: by the time
  // a definition is compared, the names it refers to are settled.
  for (const name of Object.keys(preset.components).reverse()) {
    const def = clone(preset.components[name]);
    if (def.root) def.root = renameRefs(def.root, names);
    const same = Object.entries(existing).find(([, d]) => sameJson(d, def));
    if (same) {
      names[name] = same[0];
      continue;
    }
    const free = freeName(name, taken);
    taken.add(free);
    names[name] = free;
    components[free] = def;
  }

  // Keep the preset's own order (main component first) for what's new.
  const ordered: Record<string, ComponentDef> = { ...existing };
  for (const name of Object.keys(preset.components)) {
    const final = names[name];
    if (!(final in existing)) ordered[final] = components[final];
  }
  const first = Object.keys(preset.components)[0];
  return { config: { ...config, components: ordered }, name: names[first], names };
}
