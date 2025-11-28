import { App, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, Notice, FileSystemAdapter, Modal, ButtonComponent } from 'obsidian';
import * as child_process from 'child_process';
import * as path from 'path';

// Interface for Plugin Settings
interface RedactPluginSettings {
    cliPath: string;
    profile: string;
    enableLog: boolean;
    customArgs: string;
}

const DEFAULT_SETTINGS: RedactPluginSettings = {
    cliPath: '/usr/local/bin/redact', // Default install location from README
    profile: 'default',
    enableLog: true,
    customArgs: ''
}

export default class RedactPlugin extends Plugin {
    settings: RedactPluginSettings;

    async onload() {
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new RedactSettingTab(this.app, this));

        // Register the Right-Click Menu Event
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file: TAbstractFile) => {
                // Only add option for files, not folders
                if (file instanceof TFile) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Redact File')
                            .setIcon('shield-alert') // Appropriate icon for redaction
                            .onClick(async () => {
                                await this.redactFile(file);
                            });
                    });
                }
            })
        );
    }

    async redactFile(file: TFile) {
        const adapter = this.app.vault.adapter;

        if (!(adapter instanceof FileSystemAdapter)) {
            new Notice('Redact Tool: Cannot determine absolute path (Mobile/Web not supported).');
            return;
        }

        // Get absolute path to the file
        const basePath = adapter.getBasePath();
        const absolutePath = path.join(basePath, file.path);

        // Construct the command based on settings
        // Usage: redact <file> --profile <name> [--log] [other args]
        const profileFlag = this.settings.profile ? `--profile "${this.settings.profile}"` : '';
        const logFlag = this.settings.enableLog ? '--log' : '';

        const command = `"${this.settings.cliPath}" "${absolutePath}" ${profileFlag} ${logFlag} ${this.settings.customArgs}`;

        new Notice(`Running Redact Tool on: ${file.name}`);

        // Execute the CLI tool
        child_process.exec(command, (error, stdout, stderr) => {
            // Strip ANSI color codes from output for display in Obsidian
            // The tool uses colors (Features: "Colorized Output"), which look like garbage characters in raw text.
            // Regex to remove CSI (Control Sequence Introducer) codes
            const cleanStdout = stdout.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const cleanStderr = stderr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

            if (error) {
                console.error(`Redact Tool Error: ${error.message}`);
                new RedactResultModal(this.app, "Redaction Failed", error.message + "\n" + cleanStderr).open();
                return;
            }

            // If success, show the log
            console.log(`Redact Tool Stdout: ${cleanStdout}`);

            if (this.settings.enableLog) {
                new RedactResultModal(this.app, "Redaction Complete", cleanStdout || "File processed successfully (No output captured).").open();
            } else {
                new Notice(`Successfully redacted: ${file.name}`);
            }
        });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

/**
 * Modal to display the output/log from the Redact CLI
 */
class RedactResultModal extends Modal {
    title: string;
    message: string;

    constructor(app: App, title: string, message: string) {
        super(app);
        this.title = title;
        this.message = message;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: this.title });

        // Use a pre-formatted block to preserve spacing of the log table
        const codeBlock = contentEl.createEl('pre');
        codeBlock.createEl('code', { text: this.message });

        // Add a close button
        new ButtonComponent(contentEl)
            .setButtonText("Close")
            .onClick(() => {
                this.close();
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class RedactSettingTab extends PluginSettingTab {
    plugin: RedactPlugin;

    constructor(app: App, plugin: RedactPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Redact Tool Settings' });

        new Setting(containerEl)
            .setName('CLI Executable Path')
            .setDesc('Absolute path to the redact executable.')
            .addText(text => text
                .setPlaceholder('/usr/local/bin/redact')
                .setValue(this.plugin.settings.cliPath)
                .onChange(async (value) => {
                    this.plugin.settings.cliPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Active Profile')
            .setDesc('The profile to use (e.g., "default", "work", "logs"). correlates to --profile')
            .addText(text => text
                .setPlaceholder('default')
                .setValue(this.plugin.settings.profile)
                .onChange(async (value) => {
                    this.plugin.settings.profile = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show Replacement Log')
            .setDesc('If enabled, a popup will show the replacement statistics after running. (Uses --log flag)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableLog)
                .onChange(async (value) => {
                    this.plugin.settings.enableLog = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Additional Arguments')
            .setDesc('Any extra flags to pass to the tool (e.g., "-o custom_output.txt" or "--add /path/to/extra.txt").')
            .addText(text => text
                .setPlaceholder('')
                .setValue(this.plugin.settings.customArgs)
                .onChange(async (value) => {
                    this.plugin.settings.customArgs = value;
                    await this.plugin.saveSettings();
                }));
    }
}
