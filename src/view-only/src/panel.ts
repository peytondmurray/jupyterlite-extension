import { NotebookPanel, Notebook, INotebookModel, StaticNotebook } from '@jupyterlab/notebook';
import { DocumentWidget } from '@jupyterlab/docregistry';
import { Token } from '@lumino/coreutils';

export class ViewOnlyNotebookPanel extends NotebookPanel {
  constructor(options: DocumentWidget.IOptions<Notebook, INotebookModel>) {
    super(options);

    this.toolbar.hide();
    if (this.model !== null) {
      this.model.readOnly = true;
    }
  }
}

/**
 * A namespace for `NotebookPanel` statics.
 */
export namespace ViewOnlyNotebookPanel {
  /**
   * Notebook config interface for NotebookPanel
   */
  export interface IConfig {
    /**
     * Whether to automatically start the preferred kernel
     */
    autoStartDefault: boolean;
    /**
     * A config object for cell editors
     */
    editorConfig: StaticNotebook.IEditorConfig;
    /**
     * A config object for notebook widget
     */
    notebookConfig: StaticNotebook.INotebookConfig;
    /**
     * Whether to shut down the kernel when closing the panel or not
     */
    kernelShutdown: boolean;
  }

  /**
   * A content factory interface for NotebookPanel.
   */
  export interface IContentFactory extends Notebook.IContentFactory {
    /**
     * Create a new content area for the panel.
     */
    createNotebook(options: Notebook.IOptions): Notebook;
  }

  /**
   * The default implementation of an `IContentFactory`.
   */
  export class ContentFactory
    extends Notebook.ContentFactory
    implements IContentFactory
  {
    /**
     * Create a new content area for the panel.
     */
    createNotebook(options: Notebook.IOptions): Notebook {
      return new Notebook(options);
    }
  }

  /**
   * The notebook renderer token.
   */
  export const IContentFactory = new Token<IContentFactory>(
    '@jupyterlab/notebook:IContentFactory',
    `A factory object that creates new notebooks.
    Use this if you want to create and host notebooks in your own UI elements.`
  );
}
