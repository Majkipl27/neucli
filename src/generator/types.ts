export interface Config {
  meta: {
    name: string;
    description?: string;
    lang?: string;
    favicon?: string;
  };
  theme?: {
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    extend?: any;
  };
  globals?: {
    navbar?: Node;
    footer?: Node;
  };
  pages: Page[];
  dependencies?: Record<string, string>;
  components?: Record<string, ComponentDef>;
}

export interface Page {
  path: string;
  name: string;
  title?: string;
  meta?: {
    description?: string;
  };
  sections: Node[];
}

export interface Node {
  type: string;
  id?: string;
  className?: string;
  props?: Record<string, any>;
  attrs?: Record<string, any>;
  children?: Node[];
  text?: string;
  tag?: string;
}

export interface ComponentDef {
  tag?: string;
  logic?: string;
  imports?: string[];
  children?: Node[];
}

export interface Features {
  routing: boolean;
}

export interface AnalysisResult {
  features: Features;
  dependencies: Record<string, string>;
}
