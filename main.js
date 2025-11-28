const {
    Plugin,
    PluginSettingTab,
    Setting,
    TFile,
    Notice,
    FileSystemAdapter,
    Modal,
    ButtonComponent
} = require('obsidian');
const child_process = require('child_process');
const path = require('path');

const DEFAULT_SETTINGS = {
    cliPath: '/usr/local/bin/redact',
    profile: 'default',
    enableLog: true,
    customArgs: ''
};

module.exports = class RedactPlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.addSettingTab(new RedactSettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile) {
                    menu.addItem((item) => {
                        item
                            .setTitle('Redact File')
                            .setIcon('shield-alert')
                            .onClick(async () => {
                                await this.redactFile(file);
                            });
                    });
                }
            })
        );
    }

// javascript
    async redactFile(file) {
        const adapter = this.app.vault.adapter;

        if (!(adapter instanceof FileSystemAdapter)) {
            new Notice('Redact Tool: Cannot determine absolute path (Mobile/Web not supported).');
            return;
        }

        const basePath = adapter.getBasePath();
        const absolutePath = path.join(basePath, file.path);

        const profileFlag = this.settings.profile
                            ? `--profile ${this.settings.profile}`
                            : '';
        const logFlag = this.settings.enableLog
                        ? '--log'
                        : '';
        const customArgs = this.settings.customArgs || '';

        // Build a single shell command string and run with spawn(..., { shell: true })
        const command = `${this.settings.cliPath} "${absolutePath}" ${profileFlag} ${logFlag} ${customArgs}`.trim();

        new Notice(`Running Redact Tool on: ${file.name}`);

        const proc = child_process.spawn(command, { shell: true });

        let stdout = '';
        let stderr = '';

        if (proc.stdout) {
            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });
        }

        if (proc.stderr) {
            proc.stderr.on('data', (data) => {
                stderr += data.toString();
            });
        }

        proc.on('error', (error) => {
            console.error(`Redact Tool Error: ${error.message}`);
            const cleanStderr = (stderr || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            new RedactResultModal(this.app, "Redaction Failed", error.message + "\n" + cleanStderr).open();
        });

        proc.on('close', (code) => {
            const cleanStdout = (stdout || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const cleanStderr = (stderr || '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

            if (code !== 0) {
                console.error(`Redact Tool exited with code ${code}`);
                new RedactResultModal(this.app, "Redaction Failed", `Exit code: ${code}\n${cleanStderr}`).open();
                return;
            }

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

    onunload() {
    }
};

class RedactResultModal extends Modal {
    constructor(app, title, message) {
        super(app);
        this.title = title;
        this.message = message;
    }

    onOpen() {
        const {contentEl} = this;

        contentEl.createEl('h2', {text: this.title});

        const codeBlock = contentEl.createEl('pre');
        codeBlock.createEl('code', {text: this.message});

        new ButtonComponent(contentEl)
            .setButtonText("Close")
            .onClick(() => {
                this.close();
            });

        const copyButton = new ButtonComponent(contentEl)
            .setButtonText("Copy Logs")
            .onClick(() => {
                navigator.clipboard.writeText(this.message);
                new Notice("Logs copied to clipboard.");
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class RedactSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Redact Tool Settings'});

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
