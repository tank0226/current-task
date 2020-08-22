/** @typedef { import("electron").Rectangle } Rectangle */

/** @typedef { import("../types/DefaultWindowBoundsListener").DefaultWindowBoundsListener } DefaultWindowBoundsListener */
/** @typedef { import("../types/DialogInput").DialogInput } DialogInput */
/** @typedef { import("../types/Status").Status } Status */

const { dialog, BrowserWindow, screen, ipcMain, shell } = require("electron");
const path = require("path");
const debounceFn = require("debounce-fn");

const ENSURE_ON_TOP_INTERVAL = 1000;
const MOVE_RESIZE_DEBOUNCE_INTERVAL = 1000;

const WEB_PREFERENCES_FOR_WINDOW = {
    // https://stackoverflow.com/a/59888788
    nodeIntegration: false, // is default value after Electron v5
    contextIsolation: true, // protect against prototype pollution
    enableRemoteModule: false, // turn off remote
    preload: path.join(__dirname, "../preload.js"), // use a preload script
};

const DIALOG_WINDOW_WIDTH = 400;

class AppWindow {
    /**
     * @param {boolean} [movingResizingEnabled]
     * @param {Rectangle} [existingDefaultWindowBounds]
     * @param {DefaultWindowBoundsListener} defaultWindowBoundsListener
     */
    constructor(movingResizingEnabled, existingDefaultWindowBounds, defaultWindowBoundsListener) {
        this._movingResizingEnabled = !!movingResizingEnabled;

        this._initializeWindowBounds();

        if (existingDefaultWindowBounds) {
            this._defaultWindowBounds = existingDefaultWindowBounds;
        }

        this._defaultWindowBoundsListener = defaultWindowBoundsListener;

        this._initializeWindow();
        this._naggingModeEnabled = false;
        this._hiddenModeEnabled = false;

        this._trayMenuOpened = false;

        this._openDialog = undefined;

        setInterval(() => {
            // when hovering the mouse over the taskbar, the window can get hidden behind the taskbar
            const shouldEnsureOnTop =
                !this._trayMenuOpened && !this._hiddenModeEnabled && !this._isFullyWithinWorkArea();

            if (shouldEnsureOnTop) {
                this._browserWindow.moveTop();
            }
        }, ENSURE_ON_TOP_INTERVAL);
    }

    _initializeWindowBounds() {
        const screenWidth = screen.getPrimaryDisplay().bounds.width;
        const screenHeight = screen.getPrimaryDisplay().bounds.height;

        const workAreaHeight = screen.getPrimaryDisplay().workArea.height;
        const workAreaY = screen.getPrimaryDisplay().workArea.y;
        const spaceAtTop = workAreaY;
        const spaceAtBottom = screenHeight - workAreaY - workAreaHeight;

        // https://github.com/mistermicheels/current-task/issues/1
        const defaultWindowHeight = Math.max(spaceAtTop, spaceAtBottom, 38);
        let defaultWindowY;

        if (spaceAtTop > spaceAtBottom) {
            defaultWindowY = 0;
        } else {
            defaultWindowY = screenHeight - defaultWindowHeight;
        }

        this._defaultWindowBounds = {
            width: screenWidth * 0.25,
            height: defaultWindowHeight,
            x: screenWidth * 0.5,
            y: defaultWindowY,
        };

        this._naggingWindowBounds = {
            width: screenWidth * 0.5,
            height: screenHeight * 0.5,
            x: screenWidth * 0.25,
            y: screenHeight * 0.25,
        };
    }

    async _initializeWindow() {
        this._browserWindow = new BrowserWindow({
            ...this._defaultWindowBounds,
            frame: false,
            skipTaskbar: true,
            fullscreenable: false,
            maximizable: false,
            minimizable: false,
            closable: false,
            movable: this._movingResizingEnabled,
            resizable: this._movingResizingEnabled,
            focusable: false,
            webPreferences: WEB_PREFERENCES_FOR_WINDOW,
            show: false,
        });

        this._browserWindow.setAlwaysOnTop(true, "pop-up-menu");

        const appWindowFilePath = path.join(__dirname, "../renderer/app-window/app-window.html");
        await this._browserWindow.loadFile(appWindowFilePath);
        this._browserWindow.show();

        const moveResizeHandler = debounceFn(() => this._captureDefaultWindowBounds(), {
            wait: MOVE_RESIZE_DEBOUNCE_INTERVAL,
        });

        this._browserWindow.on("move", moveResizeHandler);
        this._browserWindow.on("resize", moveResizeHandler);
    }

    _captureDefaultWindowBounds() {
        if (this._naggingModeEnabled) {
            return;
        }

        const windowBounds = this._browserWindow.getBounds();

        const defaultNeedsUpdate = Object.keys(windowBounds).some(
            (key) => windowBounds[key] !== this._defaultWindowBounds[key]
        );

        if (defaultNeedsUpdate) {
            this._defaultWindowBounds = windowBounds;
            this._defaultWindowBoundsListener.onDefaultWindowBoundsChanged(windowBounds);
        }
    }

    _isFullyWithinWorkArea() {
        const windowBounds = this._browserWindow.getBounds();
        const workAreaBounds = screen.getDisplayMatching(windowBounds).workArea;

        return (
            windowBounds.x >= workAreaBounds.x &&
            windowBounds.y >= workAreaBounds.y &&
            windowBounds.x + windowBounds.width <= workAreaBounds.x + workAreaBounds.width &&
            windowBounds.y + windowBounds.height <= workAreaBounds.y + workAreaBounds.height
        );
    }

    /**
     * @param {Status} status
     * @param {string} message
     */
    updateStatusAndMessage(status, message) {
        this._browserWindow.webContents.send("fromMain", { status, message });
    }

    /** @param {boolean} shouldNag */

    setNaggingMode(shouldNag) {
        if (shouldNag && !this._naggingModeEnabled) {
            this._captureDefaultWindowBounds();
            this._naggingModeEnabled = true;
            this._applyNaggingModeEnabled();
        } else if (!shouldNag && this._naggingModeEnabled) {
            this._naggingModeEnabled = false;
            this._applyNaggingModeEnabled();
        }
    }

    _applyNaggingModeEnabled() {
        const relevantBounds = this._naggingModeEnabled
            ? this._naggingWindowBounds
            : this._defaultWindowBounds;

        this._browserWindow.setMovable(true);
        this._browserWindow.setResizable(true);
        this._browserWindow.setSize(relevantBounds.width, relevantBounds.height);
        this._browserWindow.setPosition(relevantBounds.x, relevantBounds.y);

        this._applyMovingResizingEnabled();
    }

    /** @param {boolean} shouldHide */
    setHiddenMode(shouldHide) {
        if (shouldHide && !this._hiddenModeEnabled) {
            this._hiddenModeEnabled = true;
            this._browserWindow.hide();
        } else if (!shouldHide && this._hiddenModeEnabled) {
            this._hiddenModeEnabled = false;
            this._browserWindow.show();
        }
    }

    toggleMovingResizingEnabled() {
        this._movingResizingEnabled = !this._movingResizingEnabled;
        this._applyMovingResizingEnabled();
    }

    isMovingResizingEnabled() {
        return this._movingResizingEnabled;
    }

    _applyMovingResizingEnabled() {
        const windowMovableAndResizable = this._movingResizingEnabled && !this._naggingModeEnabled;
        this._browserWindow.setMovable(windowMovableAndResizable);
        this._browserWindow.setResizable(windowMovableAndResizable);
    }

    resetPositionAndSize() {
        this._initializeWindowBounds();
        // save initialized default bounds, even if we're currently in nagging mode
        this._defaultWindowBoundsListener.onDefaultWindowBoundsChanged(this._defaultWindowBounds);
        this._applyNaggingModeEnabled();
    }

    /** @param {string} message */
    showInfoModal(message) {
        dialog.showMessageBox(this._browserWindow, {
            type: "info",
            message,
        });
    }

    async showAbout() {
        const aboutWindow = new BrowserWindow({
            width: 780,
            height: 320,
            parent: this._browserWindow,
            fullscreenable: false,
            maximizable: false,
            minimizable: false,
            resizable: false,
            webPreferences: WEB_PREFERENCES_FOR_WINDOW,
            show: false,
        });

        aboutWindow.removeMenu();
        const aboutFilePath = path.join(__dirname, "../renderer/about/about.html");
        await aboutWindow.loadFile(aboutFilePath);
        aboutWindow.show();

        aboutWindow.webContents.on("new-window", (event, url) => {
            event.preventDefault();
            shell.openExternal(url);
        });
    }

    /**
     * @param {DialogInput} input
     */
    async openDialogAndGetResult(input) {
        if (this._openDialog) {
            this._openDialog.focus();
            return undefined;
        }

        const dialogWindow = new BrowserWindow({
            width: DIALOG_WINDOW_WIDTH,
            height: 100,
            parent: this._browserWindow,
            fullscreenable: false,
            maximizable: false,
            minimizable: false,
            resizable: false,
            webPreferences: WEB_PREFERENCES_FOR_WINDOW,
            show: false,
        });

        this._openDialog = dialogWindow;

        dialogWindow.removeMenu();
        const dialogFilePath = path.join(__dirname, "../renderer/dialog/dialog.html");
        await dialogWindow.loadFile(dialogFilePath);
        dialogWindow.webContents.send("fromMain", input);

        ipcMain.once("dialogHeight", (_event, data) => {
            dialogWindow.setContentSize(DIALOG_WINDOW_WIDTH, data.height);
            dialogWindow.center();
            dialogWindow.show();
        });

        return new Promise((resolve) => {
            const dialogResultHandler = (_event, data) => {
                resolve(data.result);
                dialogWindow.close();
            };

            ipcMain.once("dialogResult", dialogResultHandler);

            dialogWindow.once("closed", () => {
                resolve(undefined);
                this._openDialog = undefined;
                ipcMain.removeListener("dialogResult", dialogResultHandler);
            });
        });
    }

    notifyTrayMenuOpened() {
        this._trayMenuOpened = true;
    }

    notifyTrayMenuClosed() {
        this._trayMenuOpened = false;
    }
}

module.exports = AppWindow;
