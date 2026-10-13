# S&RC Pune Lab Equipment Inventory

A browser-based dashboard for maintaining the S&RC Pune laboratory equipment register. It imports equipment from Excel, provides status and due-date views, and exports the register back to an Excel workbook.

## Features

- Import an `.xlsx` or `.xls` register containing **Master Equipment** and/or **General Equipment** sheets.
- View, search, filter, add, edit, and remove equipment records.
- Track calibration and preventive maintenance dates, qualification details, registration IDs, certificates, reports, and OOT records.
- Review equipment marked inactive or not for use, and see due-date and status summaries.
- Export the complete register or a filtered report to Excel.
- Choose from these current status values:
  - Calibrated - In-use
  - Calibration Not Required
  - Calibration Work in Process - Not in Use
  - Inactive – Not in USE
  - Not Calibrated – DO NOT USE

The exported workbook uses the requested 27-column register layout, with dates formatted as `DD-MMM-YY`.

## Run on Windows

1. Open the project folder in File Explorer.
2. Double-click `Start-Equipment-Dashboard.bat`.
3. The dashboard opens in Microsoft Edge at <http://127.0.0.1:4173>.
4. Use **Import workbook** to load a file, or **Connect OneDrive file** to select a workbook and enable direct reload and save.

The launcher expects the Node.js runtime at the path currently specified in `Start-Equipment-Dashboard.bat`. If you run the project on another computer, update that path to the location of `node.exe` there. You can also start the server from a terminal with `node server.js`, then open <http://127.0.0.1:4173> in Edge.

To stop the server started from a terminal, press **Ctrl+C** in that terminal. If started by the batch file, close the Node.js process when finished.

## Workbook connection

The dashboard can import a workbook using the file picker. For direct file access, use a browser that supports the File System Access API, such as Microsoft Edge, and select the workbook with **Connect OneDrive file**. The browser asks for file access; **Save to OneDrive file** writes changes back to the selected file.

The local server also exposes a workbook endpoint for the configured OneDrive file path in `server.js`. That path is specific to the current setup. Update `workbookPath` in `server.js` before using this endpoint on another computer. The server listens only on `127.0.0.1`.

Excel import and export use the SheetJS library loaded from jsDelivr, so an internet connection is needed for those features.

## Data and privacy

The dashboard runs locally in the browser. Imported workbook contents are processed in the browser; the local server serves the dashboard and, if configured, reads or writes the single workbook path set in `server.js`. Do not expose this local server to a public network.

## Push changes to GitHub

From PowerShell in the project directory:

```powershell
git status
git add README.md app.js index.html
git commit -m "Document equipment inventory dashboard"
git push
```

If this folder has not been connected to a GitHub repository yet, create a repository on GitHub and follow GitHub's instructions to add it as the `origin` remote before running `git push`.
