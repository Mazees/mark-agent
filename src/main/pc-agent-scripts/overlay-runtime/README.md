# WebView2 SDK for the Mark desktop overlay

Pinned package: Microsoft.Web.WebView2 1.0.3537.50, from Microsoft's package published on NuGet:

https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.3537.50/microsoft.web.webview2.1.0.3537.50.nupkg

The following files are redistributed unchanged. LICENSE.txt and NOTICE.txt accompany them.

| File                            | SHA-256                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| Microsoft.Web.WebView2.Core.dll | E6C517412C245C0F0D65FC494D4F7BF883EBA3CFD7023C3F66CC1FE774EC0A22 |
| Microsoft.Web.WebView2.Wpf.dll  | 832A517556D57D6106B6752B7568088FF2B6DF434365D74A923AF24D9E69CB1E |
| WebView2Loader.dll              | 2F965E10AED3B356A408978A0E6D74EB86E3E722DD008FA9AD39F68884479E85 |

Run `npm run build:computer-overlay` on Windows x64 to compile OverlayHost.cs and OverlayNative.cs into MarkOverlay.exe. The generated executable and build-id belong in release packages, not source control. No package download occurs when the overlay starts. Installed WebView2 Runtime is required. A source checkout can compile the helper once into the user's Mark native cache using the Windows .NET Framework compiler.
