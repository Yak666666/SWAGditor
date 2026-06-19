const STORAGE_KEY = 'oas_mvp_projects_v1';

const RESPONSE_CODES = [
  { code: '200', label: '200 OK',            defaultDesc: 'Success' },
  { code: '201', label: '201 Created',       defaultDesc: 'Created' },
  { code: '204', label: '204 No Content',    defaultDesc: 'No Content' },
  { code: '400', label: '400 Bad Request',   defaultDesc: 'Bad Request' },
  { code: '403', label: '403 Forbidden',     defaultDesc: 'Forbidden' },
  { code: '404', label: '404 Not Found',     defaultDesc: 'Not Found' },
  { code: '409', label: '409 Conflict',      defaultDesc: 'Conflict' },
  { code: '422', label: '422 Unprocessable', defaultDesc: 'Unprocessable Entity' },
];

const PROP_TYPES = ['string','number','integer','boolean','date','datetime','uuid','email','array','object'];

function typeToSchema(t) {
  const map = {
    date:     { type: 'string', format: 'date' },
    datetime: { type: 'string', format: 'date-time' },
    uuid:     { type: 'string', format: 'uuid' },
    email:    { type: 'string', format: 'email' },
    array:    { type: 'array', items: { type: 'string' } },
    object:   { type: 'object', properties: {} },
  };
  return map[t] ?? { type: t };
}

function buildPropSchema(type, refName, enumVals, example, isArray = false, anyOfVals = '') {
  if (type === '$ref') {
    const base = { $ref: `#/components/schemas/${refName || 'SchemaName'}` };
    return isArray ? { type: 'array', items: base } : base;
  }
  if (type === 'anyOf') {
    const parts = (anyOfVals || '').split(',').map(v => v.trim()).filter(Boolean);
    const items = parts.map(v => {
      if (v.startsWith('ref:')) return { $ref: `#/components/schemas/${v.slice(4)}` };
      const t = v.startsWith('type:') ? v.slice(5) : v;
      return typeToSchema(t);
    });
    const s = { anyOf: items };
    if (example !== '' && example != null) s.example = example;
    return s;
  }
  if (type === 'enum') {
    const vals = (enumVals || '').split(',').map(v => v.trim()).filter(Boolean);
    const s = { type: 'string', enum: vals.length ? vals : [] };
    if (example !== '' && example != null) s.example = example;
    return s;
  }
  const map = {
    date:     { type: 'string', format: 'date' },
    datetime: { type: 'string', format: 'date-time' },
    uuid:     { type: 'string', format: 'uuid' },
    email:    { type: 'string', format: 'email' },
    array:    { type: 'array', items: { type: 'string' } },
    object:   { type: 'object', properties: {} },
  };
  const s = JSON.parse(JSON.stringify(map[type] ?? { type }));
  if (example !== '' && example != null) s.example = example;
  return s;
}

function schemaToType(s) {
  if (!s) return 'string';
  if (s.$ref) return '$ref';
  if (Array.isArray(s.enum)) return 'enum';
  if (Array.isArray(s.anyOf)) return 'anyOf';
  if (s.format === 'date') return 'date';
  if (s.format === 'date-time') return 'datetime';
  if (s.format === 'uuid') return 'uuid';
  if (s.format === 'email') return 'email';
  return s.type ?? 'string';
}

// ── Data layer ──

/** @type {{id:string,name:string,doc:any}[]} */
let projects = loadProjects();
let selectedProjectId = projects[0]?.id ?? null;

function defaultDocument(name) {
  return {
    openapi: '3.1.0',
    info: { title: name, version: '1.0.0' },
    tags: [],
    paths: {},
    components: { schemas: {} },
  };
}

function createProject(name) {
  return { id: crypto.randomUUID(), name, doc: defaultDocument(name) };
}

function loadProjects() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function currentProject() {
  return projects.find(p => p.id === selectedProjectId) || null;
}

// ── DOM refs ──

const els = {
  projectsList:     document.getElementById('projectsList'),
  newProjectName:   document.getElementById('newProjectName'),
  createProjectBtn: document.getElementById('createProjectBtn'),
  editor:           document.getElementById('editor'),
  emptyState:       document.getElementById('emptyState'),
  apiTitle:         document.getElementById('apiTitle'),
  apiVersion:       document.getElementById('apiVersion'),
  apiDesc:          document.getElementById('apiDesc'),
  tagName:          document.getElementById('tagName'),
  addTagBtn:        document.getElementById('addTagBtn'),
  tagsList:         document.getElementById('tagsList'),
  schemaName:       document.getElementById('schemaName'),
  addSchemaBtn:     document.getElementById('addSchemaBtn'),
  schemasList:      document.getElementById('schemasList'),
  pathValue:        document.getElementById('pathValue'),
  pathMethod:       document.getElementById('pathMethod'),
  addPathBtn:       document.getElementById('addPathBtn'),
  pathsList:        document.getElementById('pathsList'),
  jsonPreview:      document.getElementById('jsonPreview'),
  exportBtn:              document.getElementById('exportBtn'),
  copyBtn:                document.getElementById('copyBtn'),
  importInput:            document.getElementById('importInput'),
  collapseAllSchemasBtn:  document.getElementById('collapseAllSchemasBtn'),
  collapseAllOpsBtn:      document.getElementById('collapseAllOpsBtn'),
};

// Persistent collapse state — survives re-renders
const _collapsedSchemas = new Set();
const _collapsedOps     = new Set();

function collapseAllForProject(p) {
  _collapsedSchemas.clear();
  _collapsedOps.clear();
  if (!p) return;
  for (const name of Object.keys(p.doc.components?.schemas || {}))
    _collapsedSchemas.add(name);
  for (const [path, item] of Object.entries(p.doc.paths || {}))
    for (const method of Object.keys(item))
      _collapsedOps.add(`${path}::${method}`);
}

// ── Render helpers ──

function trashIcon() {
  return `<svg viewBox="0 0 20 22" width="14" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="display:block">
    <path d="M7.5 1h5a1 1 0 0 1 0 2h-5a1 1 0 0 1 0-2z"/>
    <rect x="1" y="4" width="18" height="3.5" rx="1.5"/>
    <path d="M3 7.5l1.3 12a1.5 1.5 0 0 0 1.5 1.5h9.4a1.5 1.5 0 0 0 1.5-1.5L17 7.5z"/>
    <line x1="7.5" y1="11" x2="7" y2="17.5"/>
    <line x1="10" y1="11" x2="10" y2="17.5"/>
    <line x1="12.5" y1="11" x2="13" y2="17.5"/>
  </svg>`;
}

function updateRefs(obj, oldRef, newRef) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key === '$ref' && obj[key] === oldRef) {
      obj[key] = newRef;
    } else {
      updateRefs(obj[key], oldRef, newRef);
    }
  }
}

function applySchemaRename(input) {
  const origName = input.dataset.origName;
  const newName  = input.value.trim();
  if (!newName || newName === origName) return;
  const p = currentProject(); if (!p) return;
  const schemas = p.doc.components?.schemas;
  if (!schemas || !schemas[origName]) return;
  if (schemas[newName]) { input.value = origName; return; }
  const entries = Object.entries(schemas);
  const idx = entries.findIndex(([k]) => k === origName);
  entries[idx][0] = newName;
  p.doc.components.schemas = Object.fromEntries(entries);
  updateRefs(p.doc, `#/components/schemas/${origName}`, `#/components/schemas/${newName}`);
  persist(); renderEditor();
}

function applyPathRename(input) {
  const origPath = input.dataset.origPath;
  const newPath  = input.value.trim();
  if (!newPath || newPath === origPath) return;
  const p = currentProject(); if (!p) return;
  if (!p.doc.paths[origPath]) return;
  const entries = Object.entries(p.doc.paths);
  const idx = entries.findIndex(([k]) => k === origPath);
  entries[idx][0] = newPath;
  p.doc.paths = Object.fromEntries(entries);
  for (const key of [..._collapsedOps]) {
    if (key.startsWith(`${origPath}::`)) {
      _collapsedOps.delete(key);
      _collapsedOps.add(`${newPath}::${key.slice(origPath.length + 2)}`);
    }
  }
  persist(); renderEditor();
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function typeSelectHtml(selected) {
  return PROP_TYPES.map(t =>
    `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`
  ).join('');
}

function renderSchemaItem(name, schema, availableSchemas) {
  const props = Object.entries(schema.properties || {});
  const propsHtml = props.length
    ? props.map(([pname, pschema]) => {
        let badge, extra = '', exampleHtml = '';
        const isArrRef = pschema.type === 'array' && pschema.items?.$ref;
        const isReq = (schema.required || []).includes(pname);
        if (isArrRef) {
          const refTarget = pschema.items.$ref.replace('#/components/schemas/', '');
          badge = `<span class="prop-type-tag type-ref">$ref[ ]</span>`;
          extra = `<span class="prop-ref-link">${esc(refTarget)}</span>`;
        } else {
          const typeName = schemaToType(pschema);
          if (typeName === '$ref') {
            const refTarget = (pschema.$ref || '').replace('#/components/schemas/', '');
            badge = `<span class="prop-type-tag type-ref">$ref</span>`;
            extra = `<span class="prop-ref-link">${esc(refTarget)}</span>`;
          } else if (typeName === 'enum') {
            badge = `<span class="prop-type-tag type-enum">enum</span>`;
            extra = `<span class="prop-enum-vals">${esc((pschema.enum || []).join(', '))}</span>`;
            if (pschema.example != null) exampleHtml = `<span class="prop-example-val">ex: ${esc(String(pschema.example))}</span>`;
          } else if (typeName === 'anyOf') {
            const refs = (pschema.anyOf || []).map(s =>
              s.$ref ? s.$ref.replace('#/components/schemas/', '') : (s.type ?? '?')
            );
            badge = `<span class="prop-type-tag type-anyof">anyOf</span>`;
            extra = `<span class="prop-enum-vals">${esc(refs.join(' | '))}</span>`;
            if (pschema.example != null) exampleHtml = `<span class="prop-example-val">ex: ${esc(String(pschema.example))}</span>`;
          } else {
            badge = `<span class="prop-type-tag type-${typeName}">${typeName}</span>`;
            if (pschema.example != null) exampleHtml = `<span class="prop-example-val">ex: ${esc(String(pschema.example))}</span>`;
          }
        }
        return `<div class="prop-row" draggable="true" data-prop-name="${esc(pname)}">
          <span class="drag-handle" title="Drag to reorder">⠿</span>
          <label class="prop-req-wrap" title="Обязательное поле (required)">
            <input type="checkbox" class="prop-req-check" data-schema="${esc(name)}" data-prop="${esc(pname)}"${isReq ? ' checked' : ''}>
            <span class="prop-req-label">req</span>
          </label>
          <span class="prop-name">${esc(pname)}</span>
          ${badge}${extra}${exampleHtml}
          <button class="btn-icon" data-schema="${esc(name)}" data-del-prop="${esc(pname)}" title="Remove">×</button>
        </div>`;
      }).join('')
    : '<div class="no-props">No fields yet</div>';

  const allTypeOpts = ['string','number','integer','boolean','date','datetime','uuid','email','array','object','$ref','enum','anyOf']
    .map(t => `<option value="${t}">${t}</option>`).join('');

  const schemaOpts = availableSchemas.length
    ? availableSchemas.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
    : '<option value="">— no schemas —</option>';

  const anyOfRefChecks = availableSchemas.length
    ? availableSchemas.map(n => `<label class="anyof-check-label"><input type="checkbox" class="anyof-ref-check" value="${esc(n)}"/><span>${esc(n)}</span></label>`).join('')
    : '<span class="no-props" style="font-size:11px">Нет схем</span>';
  const anyOfTypeChecks = ['string','integer','number','boolean','array','object'].map(t =>
    `<label class="anyof-check-label"><input type="checkbox" class="anyof-type-check" value="${t}"/><span>${t}</span></label>`
  ).join('');

  return `<li class="schema-item" data-schema-name="${esc(name)}">
    <div class="schema-header">
      <button class="collapse-btn" title="Collapse / expand">▼</button>
      <input class="schema-name-input" value="${esc(name)}" data-orig-name="${esc(name)}" title="Нажмите для переименования" />
      <button class="btn-danger btn-sm" data-del-schema="${esc(name)}">${trashIcon()}</button>
    </div>
    <div class="schema-body">
      <div class="props-list">${propsHtml}</div>
      <div class="add-prop-row" data-for-schema="${esc(name)}">
        <input class="prop-name-input" placeholder="field name" />
        <select class="prop-type-select">${allTypeOpts}</select>
        <select class="prop-ref-select hidden"${availableSchemas.length ? '' : ' disabled'}>${schemaOpts}</select>
        <select class="prop-arr-select hidden"><option value="single">object</option><option value="array">array[ ]</option></select>
        <input class="prop-enum-input hidden" placeholder="val1, val2, val3" />
        <div class="prop-anyof-panel hidden">
          <div class="anyof-section"><span class="anyof-section-label">Компоненты</span>${anyOfRefChecks}</div>
          <div class="anyof-section"><span class="anyof-section-label">Типы</span>${anyOfTypeChecks}</div>
        </div>
        <input class="prop-example-input" placeholder="example (optional)" />
        <button class="btn-add-prop" data-for-schema="${esc(name)}">Add field</button>
      </div>
    </div>
  </li>`;
}

function renderTagItem(tag) {
  return `<li class="tag-item">
    <div class="tag-row">
      <span class="tag-name-pill">${esc(tag.name)}</span>
      <button class="btn-danger btn-sm" data-del-tag="${esc(tag.name)}">${trashIcon()}</button>
    </div>
  </li>`;
}

function getOpSchemaInfo(op) {
  const codes = Object.keys(op.responses || {});
  const primary = codes.find(c => c === '200' || c === '201') || codes[0];
  if (!primary) return { rtype: 'inline', rvalue: '', isArray: false };
  const schema = op.responses[primary]?.content?.['application/json']?.schema;
  if (!schema) return { rtype: 'inline', rvalue: '', isArray: false };
  if (schema.type === 'array' && schema.items) {
    const items = schema.items;
    if (items.$ref) return { rtype: 'ref', rvalue: items.$ref, isArray: true };
    return { rtype: 'inline', rvalue: JSON.stringify(items), isArray: true };
  }
  if (schema.$ref) return { rtype: 'ref', rvalue: schema.$ref, isArray: false };
  return { rtype: 'inline', rvalue: JSON.stringify(schema), isArray: false };
}

function getReqBodyInfo(op) {
  const rb = op.requestBody;
  if (!rb) return { enabled: false, rtype: 'inline', rvalue: '', isArray: false };
  const schema = rb.content?.['application/json']?.schema;
  if (!schema) return { enabled: true, rtype: 'inline', rvalue: '', isArray: false };
  if (schema.type === 'array' && schema.items) {
    const items = schema.items;
    if (items.$ref) return { enabled: true, rtype: 'ref', rvalue: items.$ref, isArray: true };
    return { enabled: true, rtype: 'inline', rvalue: JSON.stringify(items), isArray: true };
  }
  if (schema.$ref) return { enabled: true, rtype: 'ref', rvalue: schema.$ref, isArray: false };
  return { enabled: true, rtype: 'inline', rvalue: JSON.stringify(schema), isArray: false };
}

function getCodeSchemaInfo(op, code) {
  const schema = op.responses[code]?.content?.['application/json']?.schema;
  if (!schema) return { rtype: 'none', rvalue: '', isArray: false };
  if (schema.type === 'array' && schema.items) {
    const items = schema.items;
    if (items.$ref) return { rtype: 'ref', rvalue: items.$ref, isArray: true };
    return { rtype: 'inline', rvalue: JSON.stringify(items), isArray: true };
  }
  if (schema.$ref) return { rtype: 'ref', rvalue: schema.$ref, isArray: false };
  return { rtype: 'inline', rvalue: JSON.stringify(schema), isArray: false };
}

function schemaRow(path, method, prefix, rtype, rvalue, isArray, schemas, hasNone = false) {
  const refName = (rvalue || '').startsWith('#/components/schemas/')
    ? rvalue.slice('#/components/schemas/'.length) : '';
  const typeOptions = [...(hasNone ? [['none','—']] : []), ['inline','inline'], ['ref','$ref']];
  const rtypeOpts = typeOptions.map(([v, label]) =>
    `<option value="${v}"${v === rtype ? ' selected' : ''}>${label}</option>`
  ).join('');
  if (rtype === 'none') {
    return `<div class="schema-source-row">
      <select data-op="${prefix}type" data-path="${esc(path)}" data-method="${esc(method)}">${rtypeOpts}</select>
    </div>`;
  }
  const arrayOpts = ['single', 'array'].map(v =>
    `<option value="${v}"${(isArray ? 'array' : 'single') === v ? ' selected' : ''}>${v === 'array' ? 'array[ ]' : 'object'}</option>`
  ).join('');
  const schemaInput = rtype === 'ref'
    ? `<select data-op="${prefix}ref-schema" data-path="${esc(path)}" data-method="${esc(method)}" ${schemas.length ? '' : 'disabled'}>
        ${schemas.length
          ? schemas.map(n => `<option value="${esc(n)}"${n === refName ? ' selected' : ''}>${esc(n)}</option>`).join('')
          : '<option>— add schemas first —</option>'}
      </select>`
    : `<input data-op="${prefix}value" data-path="${esc(path)}" data-method="${esc(method)}"
        placeholder='{"type":"object"}' value="${esc(rvalue)}"/>`;
  return `<div class="schema-source-row">
    <select data-op="${prefix}type" data-path="${esc(path)}" data-method="${esc(method)}">${rtypeOpts}</select>
    ${schemaInput}
    <select class="array-toggle" data-op="${prefix}array" data-path="${esc(path)}" data-method="${esc(method)}">${arrayOpts}</select>
  </div>`;
}

const PARAM_TYPES = ['string','integer','number','boolean','date','datetime','uuid','email'];

function renderOperationItem(path, method, op, availableTags, availableSchemas) {
  const enabledCodes = Object.keys(op.responses || {});
  const rb = getReqBodyInfo(op);

  // ── Parameters ──
  const params = op.parameters || [];
  const paramsListHtml = params.length
    ? params.map((param, idx) => {
        const pSchema = param.schema || { type: 'string' };
        const isParamArray = pSchema.type === 'array';
        const innerType = schemaToType(isParamArray ? (pSchema.items || { type: 'string' }) : pSchema);
        const displayName = isParamArray ? `${param.name}[]` : param.name;
        const typeBadgeText = isParamArray ? `array&lt;${innerType}&gt;` : innerType;
        const typeBadgeClass = isParamArray ? 'type-array' : `type-${innerType}`;
        const paramInOpts = ['path','query','header','cookie'].map(v =>
          `<option value="${v}"${param.in===v?' selected':''}>${v}</option>`).join('');
        const paramTypeOpts2 = PARAM_TYPES.map(t =>
          `<option value="${t}"${innerType===t?' selected':''}>${t}</option>`).join('');
        return `<div class="param-row" draggable="true" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}">
          <span class="drag-handle" title="Drag to reorder">⠿</span>
          <input class="param-edit-name" value="${esc(param.name)}" placeholder="name" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}" />
          <select class="param-edit-in param-in-badge param-in-${param.in}" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}">${paramInOpts}</select>
          <label class="param-req-label" title="Required"><input type="checkbox" class="param-edit-req" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}"${param.required?' checked':''} />req</label>
          <select class="param-edit-type" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}">${paramTypeOpts2}</select>
          <label class="param-req-label" title="Array"><input type="checkbox" class="param-edit-arr" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}"${isParamArray?' checked':''} />[ ]</label>
          <input class="param-edit-desc" value="${esc(param.description||'')}" placeholder="description…" data-param-idx="${idx}" data-path="${esc(path)}" data-method="${esc(method)}" />
          <button class="btn-icon" data-del-param="${idx}" data-path="${esc(path)}" data-method="${esc(method)}">×</button>
        </div>`;
      }).join('')
    : '<div class="no-props">No parameters</div>';
  const paramTypeOpts = PARAM_TYPES.map(t => `<option value="${t}">${t}</option>`).join('');
  const addParamHtml = `<div class="add-param-row" data-path="${esc(path)}" data-method="${esc(method)}">
    <input class="param-name-input" placeholder="name" />
    <select class="param-in-select">
      <option value="path">path</option>
      <option value="query">query</option>
      <option value="header">header</option>
      <option value="cookie">cookie</option>
    </select>
    <label class="param-req-label"><input type="checkbox" class="param-req-check" checked />req</label>
    <label class="param-req-label"><input type="checkbox" class="param-arr-check" />[ ]</label>
    <select class="param-type-select">${paramTypeOpts}</select>
    <input class="param-desc-input" placeholder="description" />
    <button class="btn-add-param" data-path="${esc(path)}" data-method="${esc(method)}">+ Add</button>
  </div>`;

  const codesHtml = RESPONSE_CODES.map(rc => {
    const isEnabled = enabledCodes.includes(rc.code);
    const desc = op.responses?.[rc.code]?.description ?? rc.defaultDesc;
    const family = rc.code[0];
    const codeSchemaHtml = isEnabled && rc.code !== '204' ? (() => {
      const { rtype, rvalue, isArray } = getCodeSchemaInfo(op, rc.code);
      return `<div class="resp-schema-inline">${schemaRow(path, method, `rc${rc.code}-`, rtype, rvalue, isArray, availableSchemas, true)}</div>`;
    })() : '';
    return `<div class="resp-code-block">
      <div class="resp-code-row">
        <label class="resp-toggle">
          <input type="checkbox" data-path="${esc(path)}" data-method="${esc(method)}" data-resp-toggle="${rc.code}"${isEnabled ? ' checked' : ''}>
          <span class="resp-badge resp-${family}xx">${rc.label}</span>
        </label>
        <input class="resp-desc" placeholder="Description"
          data-path="${esc(path)}" data-method="${esc(method)}" data-resp-desc="${rc.code}"
          value="${isEnabled ? esc(desc) : ''}"
          ${isEnabled ? '' : 'disabled'}>
      </div>
      ${codeSchemaHtml}
    </div>`;
  }).join('');

  const opTags = op.tags || [];
  const tagsHtml = availableTags.length
    ? `<div class="tags-assign">${availableTags.map(t => `
        <label class="tag-checkbox-label">
          <input type="checkbox"
            data-path="${esc(path)}" data-method="${esc(method)}" data-op-tag="${esc(t.name)}"
            ${opTags.includes(t.name) ? 'checked' : ''}>
          <span class="tag-badge">${esc(t.name)}</span>
        </label>`).join('')}
      </div>`
    : '<div class="no-tags-hint">Add tags above to group this operation</div>';

  const rbBodyHtml = rb.enabled
    ? schemaRow(path, method, 'rb-', rb.rtype, rb.rvalue, rb.isArray, availableSchemas)
    : '';

  return `<li class="op-item" data-op-key="${esc(path)}::${esc(method)}" draggable="true">
    <div class="op-header">
      <span class="drag-handle op-drag-handle" title="Перетащить для сортировки">⠿</span>
      <button class="collapse-btn" title="Collapse / expand">▼</button>
      <select class="method-select method-${method}" data-path="${esc(path)}" data-current-method="${esc(method)}">
        ${['get','post','put','delete','patch'].map(m => `<option value="${m}"${m===method?' selected':''}>${m.toUpperCase()}</option>`).join('')}
      </select>
      <input class="op-path-input" value="${esc(path)}" data-orig-path="${esc(path)}" data-method="${esc(method)}" title="Нажмите для переименования пути" />
      <button class="btn-danger btn-sm" data-del-op="1" data-path="${esc(path)}" data-method="${esc(method)}">${trashIcon()}</button>
    </div>
    <div class="op-body">
      <label class="op-label">Summary
        <input data-op="summary" data-path="${esc(path)}" data-method="${esc(method)}" value="${esc(op.summary || '')}"/>
      </label>
      <label class="op-label">Description
        <input data-op="desc" data-path="${esc(path)}" data-method="${esc(method)}"
          placeholder="**Доступ** permission_name"
          value="${esc(op.description ?? '**Доступ** ')}"/>
      </label>
      <div class="op-tags-section">
        <div class="resp-section-title">Tags</div>
        ${tagsHtml}
      </div>
      <div class="params-section">
        <div class="resp-section-title">Parameters</div>
        <div class="params-list">${paramsListHtml}</div>
        ${addParamHtml}
      </div>
      <div class="req-body-section">
        <div class="resp-section-title">Request body</div>
        <label class="resp-toggle rb-toggle-label">
          <input type="checkbox" data-rb-toggle="1" data-path="${esc(path)}" data-method="${esc(method)}"${rb.enabled ? ' checked' : ''}>
          <span class="rb-toggle-text">Include request body</span>
        </label>
        ${rbBodyHtml}
      </div>
      <div class="resp-section">
        <div class="resp-section-title">Responses</div>
        ${codesHtml}
      </div>
    </div>
  </li>`;
}

var _activePreviewTab  = 'json';
var _swaggerReady      = false;
var _swaggerTimer      = null;

function refreshSwaggerUI() {
  if (!_swaggerReady) return;
  const p = currentProject();
  document.getElementById('swaggerFrame')?.contentWindow?.postMessage(
    { type: 'swagger-spec', spec: p ? JSON.parse(JSON.stringify(p.doc)) : {} }, '*'
  );
}

window.addEventListener('message', e => {
  if (e.data?.type === 'swagger-ready') {
    _swaggerReady = true;
    refreshSwaggerUI();
  }
});

document.querySelectorAll('.preview-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    _activePreviewTab = btn.dataset.tab;
    document.querySelectorAll('.preview-tab').forEach(b => b.classList.toggle('active', b === btn));
    const isJson = _activePreviewTab === 'json';
    els.jsonPreview.style.display = isJson ? 'block' : 'none';
    document.getElementById('swaggerFrame').style.display = isJson ? 'none' : 'block';
    if (!isJson) refreshSwaggerUI();
  });
});

function renderPreview() {
  if (_editingPreview) return;
  const p = currentProject();
  els.jsonPreview.value = p ? JSON.stringify(p.doc, null, 2) : '';
  if (_activePreviewTab === 'swagger') {
    clearTimeout(_swaggerTimer);
    _swaggerTimer = setTimeout(refreshSwaggerUI, 700);
  }
}

function renderEditor() {
  const p = currentProject();
  if (!p) {
    els.editor.classList.add('hidden');
    els.emptyState.classList.remove('hidden');
    els.jsonPreview.value = '';
    return;
  }

  els.emptyState.classList.add('hidden');
  els.editor.classList.remove('hidden');
  els.apiTitle.value = p.doc.info.title;
  els.apiVersion.value = p.doc.info.version;
  els.apiDesc.value = p.doc.info.description || '';

  const availableTags = p.doc.tags || [];
  const availableSchemas = Object.keys(p.doc.components?.schemas || {});
  els.tagsList.innerHTML = availableTags.map(renderTagItem).join('');

  els.schemasList.innerHTML = Object.entries(p.doc.components?.schemas || {})
    .map(([name, schema]) => renderSchemaItem(name, schema, availableSchemas))
    .join('');

  els.pathsList.innerHTML = Object.entries(p.doc.paths || {})
    .flatMap(([path, item]) =>
      Object.entries(item).map(([method, op]) => renderOperationItem(path, method, op, availableTags, availableSchemas))
    ).join('');

  // Restore collapse state from persistent Sets
  els.schemasList.querySelectorAll('.schema-item').forEach(el => {
    if (_collapsedSchemas.has(el.dataset.schemaName)) el.classList.add('collapsed');
  });
  els.pathsList.querySelectorAll('.op-item').forEach(el => {
    if (_collapsedOps.has(el.dataset.opKey)) el.classList.add('collapsed');
  });

  // Sync collapse-all button labels
  const sTotal = els.schemasList.querySelectorAll('.schema-item').length;
  const sColl  = els.schemasList.querySelectorAll('.schema-item.collapsed').length;
  els.collapseAllSchemasBtn.textContent = sTotal && sTotal === sColl ? 'Expand all' : 'Collapse all';
  const oTotal = els.pathsList.querySelectorAll('.op-item').length;
  const oColl  = els.pathsList.querySelectorAll('.op-item.collapsed').length;
  els.collapseAllOpsBtn.textContent = oTotal && oTotal === oColl ? 'Expand all' : 'Collapse all';

  renderPreview();
}

function renderProjects() {
  els.projectsList.innerHTML = '';
  for (const p of projects) {
    const li = document.createElement('li');
    if (p.id === selectedProjectId) li.classList.add('project-active');
    li.innerHTML = `<strong>${esc(p.name)}</strong><div class="row">
      <button data-id="${p.id}" data-act="select">Open</button>
      <button data-id="${p.id}" data-act="delete">Delete</button>
    </div>`;
    els.projectsList.appendChild(li);
  }
}

// ── Project events ──

els.createProjectBtn.onclick = () => {
  const name = els.newProjectName.value.trim();
  if (!name) return;
  const proj = createProject(name);
  projects.push(proj);
  selectedProjectId = proj.id;
  els.newProjectName.value = '';
  persist();
  renderProjects();
  renderEditor();
};

els.projectsList.onclick = (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const { id, act } = btn.dataset;
  if (act === 'select') {
    selectedProjectId = id;
    collapseAllForProject(currentProject());
  }
  if (act === 'delete') {
    projects = projects.filter(p => p.id !== id);
    if (selectedProjectId === id) {
      selectedProjectId = projects[0]?.id ?? null;
      collapseAllForProject(currentProject());
    }
  }
  persist();
  renderProjects();
  renderEditor();
};

els.apiTitle.oninput = () => {
  const p = currentProject(); if (!p) return;
  p.doc.info.title = els.apiTitle.value;
  persist(); renderPreview();
};

els.apiVersion.oninput = () => {
  const p = currentProject(); if (!p) return;
  p.doc.info.version = els.apiVersion.value;
  persist(); renderPreview();
};

els.apiDesc.oninput = () => {
  const p = currentProject(); if (!p) return;
  if (els.apiDesc.value) p.doc.info.description = els.apiDesc.value;
  else delete p.doc.info.description;
  persist(); renderPreview();
};

// ── Schema events ──

els.addSchemaBtn.onclick = () => {
  const p = currentProject(); if (!p) return;
  const name = els.schemaName.value.trim(); if (!name) return;
  // Prepend new schema
  p.doc.components.schemas = { [name]: { type: 'object', properties: {} }, ...p.doc.components.schemas };
  els.schemaName.value = '';
  persist(); renderEditor();
};

els.schemasList.onclick = (e) => {
  const p = currentProject(); if (!p) return;
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.classList.contains('collapse-btn')) {
    const item = btn.closest('.schema-item');
    if (!item) return;
    item.classList.toggle('collapsed');
    const key = item.dataset.schemaName;
    if (item.classList.contains('collapsed')) _collapsedSchemas.add(key);
    else _collapsedSchemas.delete(key);
    return;
  }

  if (btn.dataset.delSchema) {
    delete p.doc.components.schemas[btn.dataset.delSchema];
    persist(); renderEditor(); return;
  }

  if (btn.dataset.delProp !== undefined && btn.dataset.schema) {
    const s = p.doc.components.schemas[btn.dataset.schema];
    if (s?.properties) {
      delete s.properties[btn.dataset.delProp];
      if (s.required) {
        s.required = s.required.filter(r => r !== btn.dataset.delProp);
        if (!s.required.length) delete s.required;
      }
    }
    persist(); renderEditor(); return;
  }

  if (btn.classList.contains('btn-add-prop')) {
    const schemaName = btn.dataset.forSchema;
    const row = btn.closest('.add-prop-row');
    const propName = row?.querySelector('.prop-name-input')?.value.trim();
    if (!propName || !schemaName) return;
    const schema = p.doc.components.schemas[schemaName];
    if (!schema) return;
    const type      = row.querySelector('.prop-type-select')?.value || 'string';
    const refName   = row.querySelector('.prop-ref-select')?.value || '';
    const enumVals  = row.querySelector('.prop-enum-input')?.value || '';
    const example   = row.querySelector('.prop-example-input')?.value ?? '';
    const anyOfVals = [
      ...[...row.querySelectorAll('.anyof-ref-check:checked')].map(cb => `ref:${cb.value}`),
      ...[...row.querySelectorAll('.anyof-type-check:checked')].map(cb => `type:${cb.value}`),
    ].join(',');
    const isArr     = type === '$ref' && row.querySelector('.prop-arr-select')?.value === 'array';
    schema.properties ||= {};
    schema.properties[propName] = buildPropSchema(type, refName, enumVals, example, isArr, anyOfVals);
    row.querySelector('.prop-name-input').value = '';
    persist(); renderEditor(); return;
  }
};

els.schemasList.onchange = (e) => {
  const target = e.target;

  // Required checkbox toggle
  if (target.classList.contains('prop-req-check')) {
    const p = currentProject(); if (!p) return;
    const schema = p.doc.components.schemas[target.dataset.schema];
    if (!schema) return;
    const propName = target.dataset.prop;
    if (target.checked) {
      schema.required ||= [];
      if (!schema.required.includes(propName)) schema.required.push(propName);
    } else {
      schema.required = (schema.required || []).filter(r => r !== propName);
      if (!schema.required.length) delete schema.required;
    }
    persist(); renderPreview(); return;
  }

  // Type select — show/hide contextual inputs
  if (target.classList.contains('prop-type-select')) {
    const row = target.closest('.add-prop-row');
    if (!row) return;
    const type = target.value;
    row.querySelector('.prop-ref-select')?.classList.toggle('hidden', type !== '$ref');
    row.querySelector('.prop-arr-select')?.classList.toggle('hidden', type !== '$ref');
    row.querySelector('.prop-enum-input')?.classList.toggle('hidden', type !== 'enum');
    row.querySelector('.prop-anyof-panel')?.classList.toggle('hidden', type !== 'anyOf');
  }
};

// ── Schema property drag-and-drop ──

let _dragProp = null;

els.schemasList.addEventListener('dragstart', e => {
  const row = e.target.closest('.prop-row');
  if (!row) return;
  _dragProp = {
    schemaName: row.closest('.schema-item')?.dataset.schemaName,
    propName:   row.dataset.propName,
  };
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => row.classList.add('dragging'), 0);
});

els.schemasList.addEventListener('dragend', () => {
  document.querySelectorAll('.prop-row.dragging, .prop-row.drag-over')
    .forEach(el => el.classList.remove('dragging', 'drag-over'));
  _dragProp = null;
});

els.schemasList.addEventListener('dragover', e => {
  const row = e.target.closest('.prop-row');
  if (!row || !_dragProp) return;
  e.preventDefault();
  document.querySelectorAll('.prop-row.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (row.dataset.propName !== _dragProp.propName) row.classList.add('drag-over');
});

els.schemasList.addEventListener('dragleave', e => {
  if (!e.target.closest('.prop-row')) return;
  e.target.closest('.prop-row')?.classList.remove('drag-over');
});

els.schemasList.addEventListener('drop', e => {
  e.preventDefault();
  const row = e.target.closest('.prop-row');
  if (!row || !_dragProp) return;
  row.classList.remove('drag-over');
  const targetProp   = row.dataset.propName;
  const targetSchema = row.closest('.schema-item')?.dataset.schemaName;
  if (!targetProp || targetProp === _dragProp.propName || targetSchema !== _dragProp.schemaName) return;
  const p = currentProject(); if (!p) return;
  const schema = p.doc.components.schemas[_dragProp.schemaName];
  if (!schema?.properties) return;
  const entries = Object.entries(schema.properties);
  const fromIdx = entries.findIndex(([k]) => k === _dragProp.propName);
  const toIdx   = entries.findIndex(([k]) => k === targetProp);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = entries.splice(fromIdx, 1);
  entries.splice(toIdx, 0, moved);
  schema.properties = Object.fromEntries(entries);
  _dragProp = null;
  persist(); renderEditor();
});

// ── Parameter drag-and-drop ──

let _dragParam = null;

els.pathsList.addEventListener('dragstart', e => {
  const row = e.target.closest('.param-row');
  if (!row) return;
  _dragParam = {
    path:   row.dataset.path,
    method: row.dataset.method,
    idx:    parseInt(row.dataset.paramIdx),
  };
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => row.classList.add('dragging'), 0);
});

els.pathsList.addEventListener('dragend', () => {
  document.querySelectorAll('.param-row.dragging, .param-row.drag-over')
    .forEach(el => el.classList.remove('dragging', 'drag-over'));
  _dragParam = null;
});

els.pathsList.addEventListener('dragover', e => {
  const row = e.target.closest('.param-row');
  if (!row || !_dragParam) return;
  e.preventDefault();
  document.querySelectorAll('.param-row.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (parseInt(row.dataset.paramIdx) !== _dragParam.idx) row.classList.add('drag-over');
});

els.pathsList.addEventListener('drop', e => {
  e.preventDefault();
  const row = e.target.closest('.param-row');
  if (!row || !_dragParam) return;
  row.classList.remove('drag-over');
  const toIdx = parseInt(row.dataset.paramIdx);
  const { path, method, idx: fromIdx } = _dragParam;
  if (toIdx === fromIdx || row.dataset.path !== path || row.dataset.method !== method) return;
  const p = currentProject(); if (!p) return;
  const op = p.doc.paths[path]?.[method];
  if (!op?.parameters) return;
  const [moved] = op.parameters.splice(fromIdx, 1);
  op.parameters.splice(toIdx, 0, moved);
  _dragParam = null;
  persist(); renderEditor();
});

// ── Operation drag-and-drop ──

let _dragOp = null;

els.pathsList.addEventListener('dragstart', e => {
  if (e.target.closest('.param-row')) return;
  if (!e.target.closest('.op-drag-handle')) return;
  const item = e.target.closest('.op-item');
  if (!item) return;
  _dragOp = item.dataset.opKey;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => item.classList.add('op-dragging'), 0);
});

els.pathsList.addEventListener('dragend', () => {
  document.querySelectorAll('.op-item.op-dragging, .op-item.op-drag-over')
    .forEach(el => el.classList.remove('op-dragging', 'op-drag-over'));
  _dragOp = null;
});

els.pathsList.addEventListener('dragover', e => {
  if (!_dragOp) return;
  const item = e.target.closest('.op-item');
  if (!item) return;
  e.preventDefault();
  document.querySelectorAll('.op-item.op-drag-over').forEach(el => el.classList.remove('op-drag-over'));
  if (item.dataset.opKey !== _dragOp) item.classList.add('op-drag-over');
});

els.pathsList.addEventListener('dragleave', e => {
  if (!_dragOp) {
    e.target.closest('.param-row')?.classList.remove('drag-over');
    return;
  }
  const item = e.target.closest('.op-item');
  if (item && !item.contains(e.relatedTarget)) item.classList.remove('op-drag-over');
});

els.pathsList.addEventListener('drop', e => {
  if (!_dragOp) return;
  const item = e.target.closest('.op-item');
  if (!item || item.dataset.opKey === _dragOp) return;
  e.preventDefault();
  item.classList.remove('op-drag-over');

  const fromKey = _dragOp;
  const toKey   = item.dataset.opKey;
  _dragOp = null;

  const p = currentProject(); if (!p) return;

  // Build flat list, reorder, reconstruct paths
  const flat = Object.entries(p.doc.paths || {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).map(([method, op]) => ({ path, method, op }))
  );
  const fromIdx = flat.findIndex(x => `${x.path}::${x.method}` === fromKey);
  const toIdx   = flat.findIndex(x => `${x.path}::${x.method}` === toKey);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = flat.splice(fromIdx, 1);
  flat.splice(toIdx, 0, moved);

  const newPaths = {};
  for (const { path, method, op } of flat) {
    newPaths[path] ||= {};
    newPaths[path][method] = op;
  }
  p.doc.paths = newPaths;

  persist(); renderEditor();
});

// ── Collapse-all buttons ──

function makeCollapseAll(list, selector, collapseSet, dataKey) {
  return function () {
    const items = [...list.querySelectorAll(selector)];
    if (!items.length) return;
    const allCollapsed = items.every(el => el.classList.contains('collapsed'));
    items.forEach(el => {
      el.classList.toggle('collapsed', !allCollapsed);
      const key = el.dataset[dataKey];
      if (key) { if (!allCollapsed) collapseSet.add(key); else collapseSet.delete(key); }
    });
    this.textContent = allCollapsed ? 'Collapse all' : 'Expand all';
  };
}

els.collapseAllSchemasBtn.onclick = makeCollapseAll(els.schemasList, '.schema-item', _collapsedSchemas, 'schemaName');
els.collapseAllOpsBtn.onclick     = makeCollapseAll(els.pathsList,   '.op-item',     _collapsedOps,     'opKey');

// ── Inline rename: schema name ──

els.schemasList.addEventListener('focusout', e => {
  if (!e.target.classList.contains('schema-name-input')) return;
  applySchemaRename(e.target);
});
els.schemasList.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('schema-name-input')) return;
  e.preventDefault();
  e.target.blur();
});

// ── Inline rename: operation path ──

els.pathsList.addEventListener('focusout', e => {
  if (!e.target.classList.contains('op-path-input')) return;
  applyPathRename(e.target);
});
els.pathsList.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('op-path-input')) return;
  e.preventDefault();
  e.target.blur();
});

// ── Tag events ──

els.addTagBtn.onclick = () => {
  const p = currentProject(); if (!p) return;
  const name = els.tagName.value.trim(); if (!name) return;
  p.doc.tags ||= [];
  if (p.doc.tags.some(t => t.name === name)) return;
  p.doc.tags.unshift({ name });
  els.tagName.value = '';
  persist(); renderEditor();
};

els.tagsList.onclick = (e) => {
  const p = currentProject(); if (!p) return;
  const btn = e.target.closest('button[data-del-tag]');
  if (!btn) return;
  const tagName = btn.dataset.delTag;
  p.doc.tags = (p.doc.tags || []).filter(t => t.name !== tagName);
  Object.values(p.doc.paths || {}).forEach(item =>
    Object.values(item).forEach(op => {
      if (op.tags) {
        op.tags = op.tags.filter(t => t !== tagName);
        if (!op.tags.length) delete op.tags;
      }
    })
  );
  persist(); renderEditor();
};

// ── Path events ──

els.addPathBtn.onclick = () => {
  const p = currentProject(); if (!p) return;
  const path = els.pathValue.value.trim();
  const method = els.pathMethod.value;
  if (!path) return;
  const newOp = {
    summary: '',
    description: '**Доступ** ',
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } },
    },
  };
  // Prepend new path (or new method within existing path)
  if (!p.doc.paths[path]) {
    p.doc.paths = { [path]: { [method]: newOp }, ...p.doc.paths };
  } else {
    p.doc.paths[path] = { [method]: newOp, ...p.doc.paths[path] };
  }
  persist(); renderEditor();
};

els.pathsList.onclick = (e) => {
  const p = currentProject(); if (!p) return;
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.classList.contains('collapse-btn')) {
    const item = btn.closest('.op-item');
    if (!item) return;
    item.classList.toggle('collapsed');
    const key = item.dataset.opKey;
    if (item.classList.contains('collapsed')) _collapsedOps.add(key);
    else _collapsedOps.delete(key);
    return;
  }

  if (btn.dataset.delOp) {
    const { path, method } = btn.dataset;
    delete p.doc.paths[path][method];
    if (!Object.keys(p.doc.paths[path]).length) delete p.doc.paths[path];
    persist(); renderEditor(); return;
  }

  if (btn.dataset.delParam !== undefined) {
    const { path, method } = btn.dataset;
    const op = p.doc.paths[path]?.[method];
    if (!op?.parameters) return;
    op.parameters.splice(parseInt(btn.dataset.delParam), 1);
    if (!op.parameters.length) delete op.parameters;
    persist(); renderEditor(); return;
  }

  if (btn.classList.contains('btn-add-param')) {
    const { path, method } = btn.dataset;
    const op = p.doc.paths[path]?.[method]; if (!op) return;
    const row = btn.closest('.add-param-row');
    const name = row?.querySelector('.param-name-input')?.value.trim();
    if (!name) return;
    const inVal    = row.querySelector('.param-in-select')?.value || 'query';
    const required = inVal === 'path' ? true : !!(row.querySelector('.param-req-check')?.checked);
    const typeVal  = row.querySelector('.param-type-select')?.value || 'string';
    const isArr    = !!(row.querySelector('.param-arr-check')?.checked);
    const desc     = row.querySelector('.param-desc-input')?.value.trim();
    const schema   = isArr ? { type: 'array', items: typeToSchema(typeVal) } : typeToSchema(typeVal);
    const param    = { name, in: inVal, required, schema };
    if (desc) param.description = desc;
    op.parameters ||= [];
    op.parameters.unshift(param);
    row.querySelector('.param-name-input').value = '';
    row.querySelector('.param-desc-input').value = '';
    persist(); renderEditor(); return;
  }
};

els.pathsList.onchange = (e) => {
  const target = e.target;
  const p = currentProject(); if (!p) return;

  // ── method type change ──
  if (target.classList.contains('method-select')) {
    const oldMethod = target.dataset.currentMethod;
    const newMethod = target.value;
    const ptath = target.dataset.path;
    if (!ptath || !oldMethod || newMethod === oldMethod) return;
    if (!p.doc.paths[ptath]?.[oldMethod]) return;
    p.doc.paths[ptath][newMethod] = p.doc.paths[ptath][oldMethod];
    delete p.doc.paths[ptath][oldMethod];
    const oldKey = `${ptath}::${oldMethod}`, newKey = `${ptath}::${newMethod}`;
    if (_collapsedOps.has(oldKey)) { _collapsedOps.delete(oldKey); _collapsedOps.add(newKey); }
    persist(); renderEditor(); return;
  }

  // ── param inline edits ──
  if (target.classList.contains('param-edit-in')) {
    const { path, method } = target.dataset;
    const idx = parseInt(target.dataset.paramIdx);
    const op = p.doc.paths[path]?.[method]; if (!op?.parameters?.[idx]) return;
    op.parameters[idx].in = target.value;
    if (target.value === 'path') op.parameters[idx].required = true;
    ['path','query','header','cookie'].forEach(v => target.classList.remove(`param-in-${v}`));
    target.classList.add(`param-in-${target.value}`);
    if (target.value === 'path') {
      target.closest('.param-row')?.querySelector('.param-edit-req')?.setAttribute('checked','');
      target.closest('.param-row')?.querySelector('.param-edit-req') && (target.closest('.param-row').querySelector('.param-edit-req').checked = true);
    }
    persist(); renderPreview(); return;
  }
  if (target.classList.contains('param-edit-type')) {
    const { path, method } = target.dataset;
    const idx = parseInt(target.dataset.paramIdx);
    const op = p.doc.paths[path]?.[method]; if (!op?.parameters?.[idx]) return;
    const isArr = op.parameters[idx].schema?.type === 'array';
    op.parameters[idx].schema = isArr
      ? { type: 'array', items: typeToSchema(target.value) }
      : typeToSchema(target.value);
    persist(); renderPreview(); return;
  }
  if (target.classList.contains('param-edit-arr')) {
    const { path, method } = target.dataset;
    const idx = parseInt(target.dataset.paramIdx);
    const op = p.doc.paths[path]?.[method]; if (!op?.parameters?.[idx]) return;
    const cur = op.parameters[idx].schema || { type: 'string' };
    op.parameters[idx].schema = target.checked
      ? { type: 'array', items: cur.type === 'array' ? (cur.items || { type: 'string' }) : cur }
      : (cur.type === 'array' ? (cur.items || { type: 'string' }) : cur);
    persist(); renderPreview(); return;
  }
  if (target.classList.contains('param-edit-req')) {
    const { path, method } = target.dataset;
    const idx = parseInt(target.dataset.paramIdx);
    const op = p.doc.paths[path]?.[method]; if (!op?.parameters?.[idx]) return;
    op.parameters[idx].required = target.checked;
    persist(); renderPreview(); return;
  }

  const { path, method } = target.dataset;
  if (!path || !method) return;
  const op = p.doc.paths[path]?.[method];
  if (!op) return;

  // ── tag checkbox ──
  if (target.dataset.opTag !== undefined) {
    const tagName = target.dataset.opTag;
    op.tags ||= [];
    if (target.checked) {
      if (!op.tags.includes(tagName)) op.tags.push(tagName);
    } else {
      op.tags = op.tags.filter(t => t !== tagName);
      if (!op.tags.length) delete op.tags;
    }
    persist(); renderPreview(); return;
  }

  // ── response code toggle ──
  if (target.dataset.respToggle) {
    const code = target.dataset.respToggle;
    const rcInfo = RESPONSE_CODES.find(r => r.code === code);
    if (target.checked) {
      const isSuccess = code === '200' || code === '201';
      op.responses[code] = {
        description: rcInfo?.defaultDesc ?? 'Response',
        ...(isSuccess ? { content: { 'application/json': { schema: { type: 'object' } } } } : {}),
      };
    } else {
      delete op.responses[code];
    }
    persist(); renderEditor(); return;
  }

  // ── request body toggle ──
  if (target.dataset.rbToggle) {
    if (target.checked) {
      const first = Object.keys(p.doc.components?.schemas || {})[0];
      op.requestBody = { required: true, content: { 'application/json': {
        schema: first ? { $ref: `#/components/schemas/${first}` } : { type: 'object' }
      }}};
    } else {
      delete op.requestBody;
    }
    persist(); renderEditor(); return;
  }

  // ── per-response-code schema ──
  const rcMatch = /^rc(\d+)-(.+)$/.exec(target.dataset.op || '');
  if (rcMatch) {
    const [, code, action] = rcMatch;
    if (!op.responses[code]) return;
    if (action === 'ref-schema') {
      const { isArray } = getCodeSchemaInfo(op, code);
      applyCodeSchema(op, code, { $ref: `#/components/schemas/${target.value}` }, isArray);
      persist(); renderPreview(); return;
    }
    if (action === 'type') {
      if (target.value === 'none') {
        delete op.responses[code].content;
      } else {
        const { isArray } = getCodeSchemaInfo(op, code);
        const first = Object.keys(p.doc.components?.schemas || {})[0];
        const base = target.value === 'ref'
          ? { $ref: first ? `#/components/schemas/${first}` : '#/components/schemas/Example' }
          : { type: 'object' };
        applyCodeSchema(op, code, base, isArray);
      }
      persist(); renderEditor(); return;
    }
    if (action === 'array') {
      const { rtype, rvalue } = getCodeSchemaInfo(op, code);
      const isArray = target.value === 'array';
      const base = rtype === 'ref' ? { $ref: rvalue }
        : (() => { try { return JSON.parse(rvalue || '{}'); } catch { return { type: 'object' }; } })();
      applyCodeSchema(op, code, base, isArray);
      persist(); renderPreview(); return;
    }
  }

  // ── request body schema controls ──
  if (target.dataset.op === 'rb-ref-schema') {
    const { isArray } = getReqBodyInfo(op);
    applyReqBodySchema(op, { $ref: `#/components/schemas/${target.value}` }, isArray);
    persist(); renderPreview(); return;
  }
  if (target.dataset.op === 'rb-type') {
    const { isArray } = getReqBodyInfo(op);
    const first = Object.keys(p.doc.components?.schemas || {})[0];
    const base = target.value === 'ref'
      ? { $ref: first ? `#/components/schemas/${first}` : '#/components/schemas/Example' }
      : { type: 'object' };
    applyReqBodySchema(op, base, isArray);
    persist(); renderEditor(); return;
  }
  if (target.dataset.op === 'rb-array') {
    const { rtype, rvalue } = getReqBodyInfo(op);
    const isArray = target.value === 'array';
    const base = rtype === 'ref' ? { $ref: rvalue }
      : (() => { try { return JSON.parse(rvalue || '{}'); } catch { return { type: 'object' }; } })();
    applyReqBodySchema(op, base, isArray);
    persist(); renderPreview(); return;
  }
};

els.pathsList.oninput = (e) => {
  const target = e.target;
  const p = currentProject(); if (!p) return;

  // ── param name / desc live edit ──
  if (target.classList.contains('param-edit-name')) {
    const { path, method } = target.dataset;
    const idx = parseInt(target.dataset.paramIdx);
    const op = p.doc.paths[path]?.[method]; if (!op?.parameters?.[idx]) return;
    op.parameters[idx].name = target.value;
    persist(); renderPreview(); return;
  }
  if (target.classList.contains('param-edit-desc')) {
    const { path, method } = target.dataset;
    const idx = parseInt(target.dataset.paramIdx);
    const op = p.doc.paths[path]?.[method]; if (!op?.parameters?.[idx]) return;
    if (target.value) op.parameters[idx].description = target.value;
    else delete op.parameters[idx].description;
    persist(); renderPreview(); return;
  }

  const { path, method } = target.dataset;
  if (!path || !method) return;
  const op = p.doc.paths[path]?.[method];
  if (!op) return;

  if (target.dataset.op === 'summary') {
    op.summary = target.value;
    persist(); renderPreview(); return;
  }

  if (target.dataset.op === 'desc') {
    if (target.value) { op.description = target.value; }
    else { delete op.description; }
    persist(); renderPreview(); return;
  }

  if (target.dataset.respDesc) {
    const code = target.dataset.respDesc;
    if (op.responses[code]) op.responses[code].description = target.value;
    persist(); renderPreview(); return;
  }

  const rcValMatch = /^rc(\d+)-value$/.exec(target.dataset.op || '');
  if (rcValMatch) {
    const code = rcValMatch[1];
    if (!op.responses[code]) return;
    try {
      const base = JSON.parse(target.value || '{"type":"object"}');
      const { isArray } = getCodeSchemaInfo(op, code);
      applyCodeSchema(op, code, base, isArray);
      persist(); renderPreview();
    } catch { /* wait for valid JSON */ }
    return;
  }

  if (target.dataset.op === 'rb-value') {
    try {
      const base = JSON.parse(target.value || '{"type":"object"}');
      const { isArray } = getReqBodyInfo(op);
      applyReqBodySchema(op, base, isArray);
      persist(); renderPreview();
    } catch { /* invalid JSON, wait for more input */ }
    return;
  }
};

function applySchema(op, baseSchema, isArray) {
  const schema = isArray ? { type: 'array', items: baseSchema } : baseSchema;
  const successCodes = Object.keys(op.responses).filter(c => c === '200' || c === '201');
  const targets = successCodes.length ? successCodes : Object.keys(op.responses);
  for (const code of targets) {
    op.responses[code].content ||= { 'application/json': { schema: {} } };
    op.responses[code].content['application/json'].schema = schema;
  }
}

function applyReqBodySchema(op, baseSchema, isArray) {
  const schema = isArray ? { type: 'array', items: baseSchema } : baseSchema;
  op.requestBody ||= { required: true, content: { 'application/json': { schema: {} } } };
  op.requestBody.content['application/json'].schema = schema;
}

function applyCodeSchema(op, code, baseSchema, isArray) {
  const schema = isArray ? { type: 'array', items: baseSchema } : baseSchema;
  op.responses[code].content ||= { 'application/json': { schema: {} } };
  op.responses[code].content['application/json'].schema = schema;
}

// ── Export / Import ──

// ── JSON preview — paste / edit ──

let _previewInputTimer = null;
let _editingPreview    = false;
let _pendingJson       = null;

els.jsonPreview.addEventListener('focus', () => { _editingPreview = true; });
els.jsonPreview.addEventListener('blur',  () => { _editingPreview = false; });

els.jsonPreview.addEventListener('input', () => {
  _pendingJson = els.jsonPreview.value; // capture immediately before any re-render can overwrite
  clearTimeout(_previewInputTimer);
  _previewInputTimer = setTimeout(() => {
    const content = _pendingJson;
    _pendingJson = null;
    if (!content) return;
    const p = currentProject(); if (!p) return;
    try {
      p.doc = JSON.parse(content);
      collapseAllForProject(p);
      persist();
      renderEditor();
    } catch { /* невалидный JSON — ждём */ }
  }, 600);
});

els.exportBtn.onclick = () => {
  const p = currentProject(); if (!p) return;
  const blob = new Blob([JSON.stringify(p.doc, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/\s+/g, '_')}.openapi.json`;
  a.click();
};

els.copyBtn.onclick = () => {
  const p = currentProject(); if (!p) return;
  navigator.clipboard.writeText(JSON.stringify(p.doc, null, 2)).then(() => {
    els.copyBtn.textContent = 'Copied!';
    setTimeout(() => { els.copyBtn.textContent = 'Copy JSON'; }, 1500);
  });
};

els.importInput.onchange = async () => {
  const file = els.importInput.files?.[0]; if (!file) return;
  const text = await file.text();
  const doc = JSON.parse(text);
  if (doc.openapi !== '3.1.0') alert('Expected OpenAPI 3.1.0');
  const p = currentProject(); if (!p) return;
  p.doc = doc;
  collapseAllForProject(p);
  persist(); renderEditor();
};

// ── Init ──

renderProjects();
renderEditor();
