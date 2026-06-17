import { createProject, safeIdentifier } from '../core/project.js';

export function exportXmlProject(project) {
  const files = {
    'project.xml': projectXml(project),
    'globals.xml': globalsXml(project)
  };
  for (const screen of project.screens) files[`screens/${screen.slug}.xml`] = screenXml(project, screen);
  for (const font of project.assets.fonts) files[`fonts/${font.filename}`] = `<!-- ${font.filename} is stored in the JSON export as base64. Put the original TTF here for LVGL Pro. -->\n`;
  return {
    filename: `${safeFilename(project.meta.name)}.lvgl-xml.txt`,
    mimeType: 'application/xml',
    files,
    content: Object.entries(files).map(([name, content]) => `<!-- ===== ${name} ===== -->\n${content}`).join('\n')
  };
}

export function importXmlProject(raw) {
  if (!('DOMParser' in globalThis)) throw new Error('XML import is only available in the browser');
  const files = splitBundle(raw);
  const projectXmlRaw = files.get('project.xml') ?? raw;
  const parser = new DOMParser();
  const projectDoc = parser.parseFromString(projectXmlRaw, 'application/xml');
  const base = createProject();
  const projectNode = projectDoc.querySelector('project');
  if (projectNode?.getAttribute('name')) base.meta.name = projectNode.getAttribute('name');
  const display = projectDoc.querySelector('display');
  if (display) {
    base.device = {
      ...base.device,
      width: Number(display.getAttribute('width') || base.device.width),
      height: Number(display.getAttribute('height') || base.device.height)
    };
  }

  const screens = [];
  for (const [name, content] of files) {
    if (!name.startsWith('screens/')) continue;
    const doc = parser.parseFromString(content, 'application/xml');
    const slug = name.replace(/^screens\//, '').replace(/\.xml$/, '');
    const screen = { id: `screen-${slug}`, name: titleFromSlug(slug), slug, permanent: doc.documentElement.getAttribute('permanent') === 'true', elements: [] };
    doc.querySelectorAll('view > *').forEach((node, index) => {
      const type = node.getAttribute('cu:type') || typeFromTag(node.tagName);
      screen.elements.push({
        id: node.getAttribute('cu:id') || `${type}-${index + 1}`,
        type,
        name: node.getAttribute('cu:name') || type,
        x: Number(node.getAttribute('x') || 0),
        y: Number(node.getAttribute('y') || 0),
        w: Number(node.getAttribute('width') || 24),
        h: Number(node.getAttribute('height') || 16),
        visible: true,
        locked: node.getAttribute('cu:locked') === 'true',
        events: {},
        props: propsFromXml(node, type)
      });
    });
    screens.push(screen);
  }
  if (screens.length) base.screens = screens;
  const start = projectDoc.querySelector('flow, cu\\:flow')?.getAttribute('start');
  base.flow.startScreenId = screens.find((screen) => screen.slug === start)?.id ?? base.screens[0].id;
  base.flow.transitions = [...projectDoc.querySelectorAll('transition, cu\\:transition')].map((node) => ({
    id: `transition-${Math.random().toString(36).slice(2, 10)}`,
    fromScreenId: screens.find((screen) => screen.slug === node.getAttribute('from'))?.id ?? base.flow.startScreenId,
    elementId: node.getAttribute('element') || '',
    trigger: node.getAttribute('trigger') || 'press',
    toScreenId: screens.find((screen) => screen.slug === node.getAttribute('to'))?.id ?? base.flow.startScreenId,
    animation: node.getAttribute('animation') || 'none'
  }));
  return base;
}

function projectXml(project) {
  return [
    `<project lvgl_version="9.5.0" name="${attr(project.meta.name)}" xmlns:cu="https://cardputer-ui-designer.local/xml">`,
    '  <targets>',
    `    <target name="${attr(project.device.id)}">`,
    `      <display width="${project.device.width}" height="${project.device.height}"/>`,
    '    </target>',
    '  </targets>',
    `  <cu:flow start="${attr(screenName(project, project.flow.startScreenId))}">`,
    ...project.flow.transitions.map((transition) => {
      const from = screenName(project, transition.fromScreenId);
      const to = screenName(project, transition.toScreenId);
      return `    <cu:transition from="${attr(from)}" element="${attr(transition.elementId)}" trigger="${attr(transition.trigger)}" to="${attr(to)}" animation="${attr(transition.animation ?? 'none')}"/>`;
    }),
    '  </cu:flow>',
    '</project>',
    ''
  ].join('\n');
}

function globalsXml(project) {
  const lines = ['<globals xmlns:cu="https://cardputer-ui-designer.local/xml">'];
  lines.push('  <fonts>');
  project.assets.fonts.forEach((font) => {
    font.variants.forEach((variant) => {
      lines.push(`    <bin as_file="false" name="${attr(fontRef(font, variant))}" src_path="fonts/${attr(font.filename)}" range="${attr(variant.range)}" symbols="${attr(variant.symbols)}" size="${variant.size}" bpp="${variant.bpp || 1}" cu:font_id="${attr(font.id)}" cu:variant_id="${attr(variant.id)}"/>`);
    });
  });
  lines.push('  </fonts>');
  lines.push('  <styles>');
  project.styles.forEach((style) => lines.push(`    <style name="${attr(style.name)}"/>`));
  lines.push('  </styles>');
  lines.push('</globals>', '');
  return lines.join('\n');
}

function screenXml(project, screen) {
  const lines = [`<screen permanent="${screen.permanent ? 'true' : 'false'}" xmlns:cu="https://cardputer-ui-designer.local/xml">`, '  <view>'];
  screen.elements.filter((element) => element.visible).forEach((element) => {
    lines.push(...elementXml(project, element, 4));
  });
  lines.push('  </view>', '</screen>', '');
  return lines.join('\n');
}

function elementXml(project, element, indent) {
  const pad = ' '.repeat(indent);
  const p = element.props;
  const common = [
    `cu:id="${attr(element.id)}"`,
    `cu:name="${attr(element.name)}"`,
    `x="${Math.round(element.x)}"`,
    `y="${Math.round(element.y)}"`,
    `width="${Math.round(element.w)}"`,
    `height="${Math.round(element.h)}"`
  ];
  if (element.locked) common.push('cu:locked="true"');

  const events = eventXml(element, indent + 2);
  const tag = tagForElement(element.type);
  const attrs = [...common, ...attrsForElement(project, element)];

  if (!events.length) return [`${pad}<${tag} ${attrs.join(' ')}/>`];
  return [`${pad}<${tag} ${attrs.join(' ')}>`, ...events, `${pad}</${tag}>`];
}

function attrsForElement(project, element) {
  const p = element.props;
  const attrs = [];
  if ('text' in p) attrs.push(`text="${attr(p.text ?? '')}"`);
  if ('fontSize' in p) attrs.push(`cu:font_size="${attr(p.fontSize)}"`);
  if (p.fontId) attrs.push(`style_text_font="${attr(fontRefForElement(project, element))}" cu:font_id="${attr(p.fontId)}"`);
  if ('fill' in p) attrs.push(`style_bg_color="${color(p.fill)}"`);
  if ('stroke' in p) attrs.push(`style_border_color="${color(p.stroke)}"`);
  if ('color' in p) attrs.push(`style_text_color="${color(p.color)}"`);
  if ('radius' in p) attrs.push(`style_radius="${Math.round(p.radius ?? 0)}"`);
  if ('value' in p) attrs.push(`value="${Math.round(p.value ?? 0)}"`);
  if ('min' in p) attrs.push(`min_value="${Math.round(p.min ?? 0)}"`);
  if ('max' in p) attrs.push(`max_value="${Math.round(p.max ?? 100)}"`);
  attrs.push(`cu:type="${attr(element.type)}"`);
  return attrs;
}

function eventXml(element, indent) {
  const pad = ' '.repeat(indent);
  return Object.entries(element.events ?? {})
    .filter(([, target]) => target)
    .map(([trigger, target]) => `${pad}<screen_load_event trigger="${attr(trigger)}" screen="${attr(target)}"/>`);
}

function tagForElement(type) {
  return {
    text: 'lv_label',
    button: 'lv_button',
    progress: 'lv_bar',
    gauge: 'lv_arc',
    line: 'lv_line',
    led: 'lv_led',
    image: 'lv_image'
  }[type] ?? 'lv_obj';
}

function fontRefForElement(project, element) {
  const font = project.assets.fonts.find((item) => item.id === element.props.fontId);
  if (!font) return '';
  const variant = [...font.variants].sort((a, b) => Math.abs(a.size - (element.props.fontSize ?? a.size)) - Math.abs(b.size - (element.props.fontSize ?? b.size)))[0];
  return variant ? fontRef(font, variant) : '';
}

function fontRef(font, variant) {
  return `${safeIdentifier(font.name)}_${variant.size}`;
}

function screenName(project, screenId) {
  return project.screens.find((screen) => screen.id === screenId)?.slug ?? '';
}

function color(hex) {
  return `0x${String(hex ?? '#ffffff').replace('#', '')}`;
}

function attr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeFilename(value) {
  return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cardputer-ui';
}

function splitBundle(raw) {
  const files = new Map();
  const regex = /<!-- ===== ([^=]+?) ===== -->\n?/g;
  const matches = [...String(raw).matchAll(regex)];
  if (!matches.length) return files;
  matches.forEach((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? raw.length;
    files.set(match[1].trim(), raw.slice(start, end).trim());
  });
  return files;
}

function typeFromTag(tagName) {
  return { lv_label: 'text', lv_button: 'button', lv_bar: 'progress', lv_arc: 'gauge', lv_line: 'line', lv_led: 'led', lv_image: 'image' }[tagName] ?? 'rect';
}

function propsFromXml(node, type) {
  const props = {};
  if (node.hasAttribute('text')) props.text = node.getAttribute('text');
  if (node.hasAttribute('cu:font_size')) props.fontSize = Number(node.getAttribute('cu:font_size'));
  if (node.hasAttribute('cu:font_id')) props.fontId = node.getAttribute('cu:font_id');
  if (node.hasAttribute('style_bg_color')) props.fill = xmlColor(node.getAttribute('style_bg_color'));
  if (node.hasAttribute('style_border_color')) props.stroke = xmlColor(node.getAttribute('style_border_color'));
  if (node.hasAttribute('style_text_color')) props.color = xmlColor(node.getAttribute('style_text_color'));
  if (node.hasAttribute('style_radius')) props.radius = Number(node.getAttribute('style_radius'));
  if (node.hasAttribute('value')) props.value = Number(node.getAttribute('value'));
  if (node.hasAttribute('min_value')) props.min = Number(node.getAttribute('min_value'));
  if (node.hasAttribute('max_value')) props.max = Number(node.getAttribute('max_value'));
  if (type === 'button') props.align = 'center';
  return props;
}

function xmlColor(value) {
  return `#${String(value || '0xffffff').replace(/^0x/, '').padStart(6, '0')}`;
}

function titleFromSlug(slug) {
  return slug.split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ');
}
