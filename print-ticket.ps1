param([Parameter(Mandatory=$true)][string]$TicketFile,[Parameter(Mandatory=$true)][string]$PrinterName)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.ComponentModel;
public static class RameRawPrinter {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public struct DOC_INFO_1 { public string pDocName; public string pOutputFile; public string pDataType; }
 [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string name,out IntPtr handle,IntPtr defaults);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool ClosePrinter(IntPtr handle);
 [DllImport("winspool.drv",SetLastError=true,CharSet=CharSet.Unicode)] static extern uint StartDocPrinter(IntPtr handle,uint level,ref DOC_INFO_1 doc);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool EndDocPrinter(IntPtr handle);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool StartPagePrinter(IntPtr handle);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool EndPagePrinter(IntPtr handle);
 [DllImport("winspool.drv",SetLastError=true)] static extern bool WritePrinter(IntPtr handle,byte[] data,uint count,out uint written);
 static void Check(bool ok){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error());}
 public static void Send(string name,byte[] bytes){
  IntPtr handle;Check(OpenPrinter(name,out handle,IntPtr.Zero));bool document=false,page=false;
  try {
   DOC_INFO_1 doc=new DOC_INFO_1{pDocName="Rame Sushi",pDataType="RAW"};
   Check(StartDocPrinter(handle,1,ref doc)!=0);document=true;
   Check(StartPagePrinter(handle));page=true;
   uint written;Check(WritePrinter(handle,bytes,(uint)bytes.Length,out written));
   if(written!=bytes.Length)throw new Exception("Windows no acepto todos los datos. Revisar antes de reintentar.");
   Check(EndPagePrinter(handle));page=false;Check(EndDocPrinter(handle));document=false;
  } finally {if(page)EndPagePrinter(handle);if(document)EndDocPrinter(handle);ClosePrinter(handle);}
 }
}
'@
[RameRawPrinter]::Send($PrinterName,[System.IO.File]::ReadAllBytes($TicketFile))
