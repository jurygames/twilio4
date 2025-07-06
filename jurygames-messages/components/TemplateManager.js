
// components/TemplateManager.js
import { useState } from 'react';
import templatesData from '../data/templates.js';

export default function TemplateManager() {
  const [templates, setTemplates] = useState(templatesData);
  // ... rest of implementation unchanged ...
}
