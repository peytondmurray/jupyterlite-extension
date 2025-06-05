import { ViewOnlyNotebookPanel } from './panel';

// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module notebook-extension
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  createToolbarFactory,
  ISessionContextDialogs,
  IToolbarWidgetRegistry,
  SessionContextDialogs,
  Toolbar,
} from '@jupyterlab/apputils';
import { CodeCell, MarkdownCell } from '@jupyterlab/cells';
import {
  CodeEditor,
  IEditorServices,
  IPositionModel
} from '@jupyterlab/codeeditor';
import { PageConfig } from '@jupyterlab/coreutils';

import { ToolbarItems as DocToolbarItems } from '@jupyterlab/docmanager-extension';
import { DocumentRegistry, } from '@jupyterlab/docregistry';
import {
  ExecutionIndicator,
  INotebookTracker,
  INotebookWidgetFactory,
  NotebookWidgetFactory,
  StaticNotebook,
  ToolbarItems
} from '@jupyterlab/notebook';
import { IObservableList } from '@jupyterlab/observables';
import {
  IRenderMimeRegistry
} from '@jupyterlab/rendermime';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import {
  notebookIcon,
} from '@jupyterlab/ui-components';
import { ArrayExt } from '@lumino/algorithm';
import { CommandRegistry } from '@lumino/commands';
import {
  UUID
} from '@lumino/coreutils';
import { Panel, Widget } from '@lumino/widgets';
import notebookPlugins from '@jupyterlab/notebook-extension';

const trackerPlugin: JupyterFrontEndPlugin<any> = notebookPlugins[2];


/**
 * The name of the factory that creates notebooks.
 */
const FACTORY = 'Notebook';

/**
 * Setting Id storing the customized toolbar definition.
 */
const PANEL_SETTINGS = '@jupyterlab/notebook-extension:panel';

/**
 * The notebook cell factory provider.
 */
const factory: JupyterFrontEndPlugin<ViewOnlyNotebookPanel.IContentFactory> = {
  id: '@jupyterlab/notebook-extension:factory',
  description: 'Provides the notebook cell factory.',
  provides: ViewOnlyNotebookPanel.IContentFactory,
  requires: [IEditorServices],
  autoStart: true,
  activate: (app: JupyterFrontEnd, editorServices: IEditorServices) => {
    const editorFactory = editorServices.factoryService.newInlineEditor;
    return new ViewOnlyNotebookPanel.ContentFactory({ editorFactory });
  }
};

/**
 * The notebook widget factory provider.
 */
const widgetFactoryPlugin: JupyterFrontEndPlugin<NotebookWidgetFactory.IFactory> =
  {
    id: '@jupyterlab/notebook-extension:widget-factory',
    description: 'Provides the notebook widget factory.',
    provides: INotebookWidgetFactory,
    requires: [
      ViewOnlyNotebookPanel.IContentFactory,
      IEditorServices,
      IRenderMimeRegistry,
      IToolbarWidgetRegistry
    ],
    optional: [ISettingRegistry, ISessionContextDialogs, ITranslator],
    activate: activateWidgetFactory,
    autoStart: true
  };

/**
 * Cursor position.
 */
const lineColStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/notebook-extension:cursor-position',
  description: 'Adds the notebook cursor position status.',
  activate: (
    app: JupyterFrontEnd,
    tracker: INotebookTracker,
    positionModel: IPositionModel
  ) => {
    let previousWidget: ViewOnlyNotebookPanel | null = null;

    const provider = async (widget: Widget | null) => {
      let editor: CodeEditor.IEditor | null = null;
      if (widget !== previousWidget) {
        previousWidget?.content.activeCellChanged.disconnect(
          positionModel.update
        );

        previousWidget = null;
        if (widget && tracker.has(widget)) {
          (widget as ViewOnlyNotebookPanel).content.activeCellChanged.connect(
            positionModel.update
          );
          const activeCell = (widget as ViewOnlyNotebookPanel).content
            .activeCell;
          editor = null;
          if (activeCell) {
            await activeCell.ready;
            editor = activeCell.editor;
          }
          previousWidget = widget as ViewOnlyNotebookPanel;
        }
      } else if (widget) {
        const activeCell = (widget as ViewOnlyNotebookPanel).content.activeCell;
        editor = null;
        if (activeCell) {
          await activeCell.ready;
          editor = activeCell.editor;
        }
      }
      return editor;
    };

    positionModel.addEditorProvider(provider);
  },
  requires: [INotebookTracker, IPositionModel],
  autoStart: true
};


/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  factory,
  widgetFactoryPlugin,
  lineColStatus,
];
export default plugins;

/**
 * Activate the notebook widget factory.
 */
function activateWidgetFactory(
  app: JupyterFrontEnd,
  contentFactory: ViewOnlyNotebookPanel.IContentFactory,
  editorServices: IEditorServices,
  rendermime: IRenderMimeRegistry,
  toolbarRegistry: IToolbarWidgetRegistry,
  settingRegistry: ISettingRegistry | null,
  sessionContextDialogs_: ISessionContextDialogs | null,
  translator_: ITranslator | null
): NotebookWidgetFactory.IFactory {
  const translator = translator_ ?? nullTranslator;
  const sessionContextDialogs =
    sessionContextDialogs_ ?? new SessionContextDialogs({ translator });
  const preferKernelOption = PageConfig.getOption('notebookStartsKernel');

  // If the option is not set, assume `true`
  const preferKernelValue =
    preferKernelOption === '' || preferKernelOption.toLowerCase() === 'true';

  const { commands } = app;
  let toolbarFactory:
    | ((
        widget: ViewOnlyNotebookPanel
      ) =>
        | DocumentRegistry.IToolbarItem[]
        | IObservableList<DocumentRegistry.IToolbarItem>)
    | undefined;

  // Register notebook toolbar widgets
  toolbarRegistry.addFactory<ViewOnlyNotebookPanel>(FACTORY, 'save', panel =>
    DocToolbarItems.createSaveButton(commands, panel.context.fileChanged)
  );
  toolbarRegistry.addFactory<ViewOnlyNotebookPanel>(
    FACTORY,
    'cellType',
    panel => ToolbarItems.createCellTypeItem(panel, translator)
  );
  toolbarRegistry.addFactory<ViewOnlyNotebookPanel>(
    FACTORY,
    'kernelName',
    panel =>
      Toolbar.createKernelNameItem(
        panel.sessionContext,
        sessionContextDialogs,
        translator
      )
  );


  toolbarRegistry.addFactory<ViewOnlyNotebookPanel>(
    FACTORY,
    'executionProgress',
    panel => {
      const trackerId = settingRegistry?.plugins['@jupyterlab/notebook-extension:tracker']?.id;
      if (trackerId === undefined) {
        return new Widget();
      }

      const loadingSettings = settingRegistry?.load(trackerId);
      const indicator = ExecutionIndicator.createExecutionIndicatorItem(
        panel,
        translator,
        loadingSettings
      );

      void loadingSettings?.then(settings => {
        panel.disposed.connect(() => {
          settings.dispose();
        });
      });

      return indicator;
    }
  );

  if (settingRegistry) {
    // Create the factory
    toolbarFactory = createToolbarFactory(
      toolbarRegistry,
      settingRegistry,
      FACTORY,
      PANEL_SETTINGS,
      translator
    );
  }

  const trans = translator.load('jupyterlab');

  const factory = new NotebookWidgetFactory({
    name: FACTORY,
    label: trans.__('Notebook'),
    fileTypes: ['notebook'],
    modelName: 'notebook',
    defaultFor: ['notebook'],
    preferKernel: preferKernelValue,
    canStartKernel: true,
    rendermime,
    contentFactory,
    editorConfig: StaticNotebook.defaultEditorConfig,
    notebookConfig: StaticNotebook.defaultNotebookConfig,
    mimeTypeService: editorServices.mimeTypeService,
    toolbarFactory,
    translator
  });
  app.docRegistry.addWidgetFactory(factory);

  return factory;
}

/**
 * A namespace for module private functionality.
 */
namespace Private {
  /**
   * Create a console connected with a notebook kernel
   *
   * @param commands Commands registry
   * @param widget Notebook panel
   * @param activate Should the console be activated
   * @param subshell Should the console contain a subshell or the main shell
   */
  export function createConsole(
    commands: CommandRegistry,
    widget: ViewOnlyNotebookPanel,
    activate?: boolean,
    subshell?: boolean
  ): Promise<void> {
    const options = {
      path: widget.context.path,
      preferredLanguage: widget.context.model.defaultKernelLanguage,
      activate: activate,
      subshell: subshell,
      ref: widget.id,
      insertMode: 'split-bottom',
      type: 'Linked Console'
    };

    return commands.execute('console:create', options);
  }

  /**
   * Whether there is an active notebook.
   */
  export function isEnabled(
    shell: JupyterFrontEnd.IShell,
    tracker: INotebookTracker
  ): boolean {
    return (
      tracker.currentWidget !== null &&
      tracker.currentWidget === shell.currentWidget
    );
  }

  /**
   * Whether there is an notebook active, with a single selected cell.
   */
  export function isEnabledAndSingleSelected(
    shell: JupyterFrontEnd.IShell,
    tracker: INotebookTracker
  ): boolean {
    if (!Private.isEnabled(shell, tracker)) {
      return false;
    }
    const { content } = tracker.currentWidget!;
    const index = content.activeCellIndex;
    // If there are selections that are not the active cell,
    // this command is confusing, so disable it.
    for (let i = 0; i < content.widgets.length; ++i) {
      if (content.isSelected(content.widgets[i]) && i !== index) {
        return false;
      }
    }
    return true;
  }

  /**
   * Whether there is an notebook active, with a single selected cell.
   */
  export function isEnabledAndHeadingSelected(
    shell: JupyterFrontEnd.IShell,
    tracker: INotebookTracker
  ): boolean {
    if (!Private.isEnabled(shell, tracker)) {
      return false;
    }
    const { content } = tracker.currentWidget!;
    const index = content.activeCellIndex;
    if (!(content.activeCell instanceof MarkdownCell)) {
      return false;
    }
    // If there are selections that are not the active cell,
    // this command is confusing, so disable it.
    for (let i = 0; i < content.widgets.length; ++i) {
      if (content.isSelected(content.widgets[i]) && i !== index) {
        return false;
      }
    }
    return true;
  }

  /**
   * The default Export To ... formats and their human readable labels.
   */
  export function getFormatLabels(translator: ITranslator): {
    [k: string]: string;
  } {
    translator = translator || nullTranslator;
    const trans = translator.load('jupyterlab');
    return {
      html: trans.__('HTML'),
      latex: trans.__('LaTeX'),
      markdown: trans.__('Markdown'),
      pdf: trans.__('PDF'),
      rst: trans.__('ReStructured Text'),
      script: trans.__('Executable Script'),
      slides: trans.__('Reveal.js Slides')
    };
  }

  /**
   * Raises a silent notification that is read by screen readers
   *
   * FIXME: Once a notificatiom API is introduced (https://github.com/jupyterlab/jupyterlab/issues/689),
   * this can be refactored to use the same.
   *
   * More discussion at https://github.com/jupyterlab/jupyterlab/pull/9031#issuecomment-773541469
   *
   *
   * @param message Message to be relayed to screen readers
   * @param notebookNode DOM node to which the notification container is attached
   */
  export function raiseSilentNotification(
    message: string,
    notebookNode: HTMLElement
  ): void {
    const hiddenAlertContainerId = `sr-message-container-${notebookNode.id}`;

    const hiddenAlertContainer =
      document.getElementById(hiddenAlertContainerId) ||
      document.createElement('div');

    // If the container is not available, append the newly created container
    // to the current notebook panel and set related properties
    if (hiddenAlertContainer.getAttribute('id') !== hiddenAlertContainerId) {
      hiddenAlertContainer.classList.add('sr-only');
      hiddenAlertContainer.setAttribute('id', hiddenAlertContainerId);
      hiddenAlertContainer.setAttribute('role', 'alert');
      hiddenAlertContainer.hidden = true;
      notebookNode.appendChild(hiddenAlertContainer);
    }

    // Insert/Update alert container with the notification message
    hiddenAlertContainer.innerText = message;
  }

  /**
   * A widget hosting a cloned output area.
   */
  export class ClonedOutputArea extends Panel {
    constructor(options: ClonedOutputArea.IOptions) {
      super();
      const trans = (options.translator || nullTranslator).load('jupyterlab');
      this._notebook = options.notebook;
      this._index = options.index !== undefined ? options.index : -1;
      this._cell = options.cell || null;
      this.id = `LinkedOutputView-${UUID.uuid4()}`;
      this.title.label = 'Output View';
      this.title.icon = notebookIcon;
      this.title.caption = this._notebook.title.label
        ? trans.__('For Notebook: %1', this._notebook.title.label)
        : trans.__('For Notebook:');
      this.addClass('jp-LinkedOutputView');

      // Wait for the notebook to be loaded before
      // cloning the output area.
      void this._notebook.context.ready.then(() => {
        if (!this._cell) {
          this._cell = this._notebook.content.widgets[this._index] as CodeCell;
        }
        if (!this._cell || this._cell.model.type !== 'code') {
          this.dispose();
          return;
        }
        const clone = this._cell.cloneOutputArea();
        this.addWidget(clone);
      });
    }

    /**
     * The index of the cell in the notebook.
     */
    get index(): number {
      return this._cell
        ? ArrayExt.findFirstIndex(
            this._notebook.content.widgets,
            c => c === this._cell
          )
        : this._index;
    }

    /**
     * The path of the notebook for the cloned output area.
     */
    get path(): string {
      return this._notebook.context.path;
    }

    private _notebook: ViewOnlyNotebookPanel;
    private _index: number;
    private _cell: CodeCell | null = null;
  }

  /**
   * ClonedOutputArea statics.
   */
  export namespace ClonedOutputArea {
    export interface IOptions {
      /**
       * The notebook associated with the cloned output area.
       */
      notebook: ViewOnlyNotebookPanel;

      /**
       * The cell for which to clone the output area.
       */
      cell?: CodeCell;

      /**
       * If the cell is not available, provide the index
       * of the cell for when the notebook is loaded.
       */
      index?: number;

      /**
       * If the cell is not available, provide the index
       * of the cell for when the notebook is loaded.
       */
      translator?: ITranslator;
    }
  }
}
