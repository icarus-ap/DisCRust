using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace DisCRust
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IMMDeviceCollection ppDevices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppEndpoint);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out uint pcDevices);
        [PreserveSig] int Item(uint nDevice, out IMMDevice ppDevice);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        [PreserveSig] int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        [PreserveSig] int GetState(out int pdwState);
    }

    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioMeterInformation
    {
        [PreserveSig] int GetPeakValue(out float pfPeak);
    }

    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    internal class PolicyConfigClientComObject { }

    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPolicyConfigWin10
    {
        [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, out IntPtr ppFormat);
        [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bDefault, out IntPtr ppFormat);
        [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName);
        [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pEndpointFormat, IntPtr MixFormat);
        [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bDefault, out long pmftDefaultPeriod, out long pmftMinimumPeriod);
        [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pmftPeriod);
        [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, out IntPtr pMode);
        [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr mode);
        [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bFxStore, IntPtr key, out IntPtr pv);
        [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bFxStore, IntPtr key, IntPtr pv);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int role);
    }

    [ComImport, Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioClient
    {
        [PreserveSig] int Initialize(int ShareMode, uint StreamFlags, long hnsBufferDuration, long hnsPeriodicity, IntPtr pFormat, IntPtr AudioSessionGuid);
        [PreserveSig] int GetBufferSize(out uint pNumBufferFrames);
        [PreserveSig] int GetStreamLatency(out long phnsLatency);
        [PreserveSig] int GetCurrentPadding(out uint pNumPaddingFrames);
        [PreserveSig] int IsFormatSupported(int ShareMode, IntPtr pFormat, out IntPtr ppClosestMatch);
        [PreserveSig] int GetMixFormat(out IntPtr ppDeviceFormat);
        [PreserveSig] int GetDevicePeriod(out long phnsDefaultDevicePeriod, out long phnsMinimumDevicePeriod);
        [PreserveSig] int Start();
        [PreserveSig] int Stop();
        [PreserveSig] int Reset();
        [PreserveSig] int SetEventHandle(IntPtr eventHandle);
        [PreserveSig] int GetService(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport, Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioCaptureClient
    {
        [PreserveSig] int GetBuffer(out IntPtr ppData, out uint pNumFramesToRead, out uint pdwFlags, out ulong pu64DevicePosition, out ulong pu64QPCPosition);
        [PreserveSig] int ReleaseBuffer(uint NumFramesRead);
        [PreserveSig] int GetNextPacketSize(out uint pNumFramesInNextPacket);
    }

    // Windows 10 (Build 20348+) / Windows 11 Process-Loopback Interfaces (mmdeviceapi.h)
    [ComImport, Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAgileObject { }

    [ComImport, Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IActivateAudioInterfaceAsyncOperation
    {
        [PreserveSig] int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    [ComImport, Guid("41D949AB-9862-444A-80F6-C261334DA5EB"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IActivateAudioInterfaceCompletionHandler
    {
        [PreserveSig] int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    internal sealed class ProcessLoopbackCompletionHandler : IActivateAudioInterfaceCompletionHandler, IAgileObject
    {
        public readonly ManualResetEvent DoneEvent = new ManualResetEvent(false);
        public IAudioClient ActivatedClient = null;
        public int ActivationHResult = -1;

        public int ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
        {
            try
            {
                if (activateOperation != null)
                {
                    int hrAct = -1;
                    object unk = null;
                    int hr = activateOperation.GetActivateResult(out hrAct, out unk);
                    ActivationHResult = hrAct;
                    if (hr >= 0 && hrAct >= 0 && unk != null)
                    {
                        ActivatedClient = unk as IAudioClient;
                    }
                }
            }
            catch { }
            finally
            {
                try { DoneEvent.Set(); } catch { }
            }
            return 0; // S_OK
        }
    }

    [ComImport, Guid("56FDF344-FD6D-11D0-958A-006097C9A090")]
    internal class TaskbarListComObject { }

    [ComImport, Guid("EA1AFB91-9E28-4B86-90E9-9E9F8A5EEFAF"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface ITaskbarList3
    {
        [PreserveSig] int HrInit();
        [PreserveSig] int AddTab(IntPtr hwnd);
        [PreserveSig] int DeleteTab(IntPtr hwnd);
        [PreserveSig] int ActivateTab(IntPtr hwnd);
        [PreserveSig] int SetActiveAlt(IntPtr hwnd);
        [PreserveSig] int MarkFullscreenWindow(IntPtr hwnd, int fFullscreen);
        [PreserveSig] int SetProgressValue(IntPtr hwnd, ulong ullCompleted, ulong ullTotal);
        [PreserveSig] int SetProgressState(IntPtr hwnd, int tbpFlags);
        [PreserveSig] int RegisterTab(IntPtr hwndTab, IntPtr hwndMDI);
        [PreserveSig] int UnregisterTab(IntPtr hwndTab);
        [PreserveSig] int SetTabOrder(IntPtr hwndTab, IntPtr hwndInsertBefore);
        [PreserveSig] int SetTabActive(IntPtr hwndTab, IntPtr hwndMDI, uint dwReserved);
        [PreserveSig] int ThumbBarAddButtons(IntPtr hwnd, uint cButtons, IntPtr pButton);
        [PreserveSig] int ThumbBarUpdateButtons(IntPtr hwnd, uint cButtons, IntPtr pButton);
        [PreserveSig] int ThumbBarSetImageList(IntPtr hwnd, IntPtr himl);
        [PreserveSig] int SetOverlayIcon(IntPtr hwnd, IntPtr hIcon, [MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
    }

    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl
    {
        [PreserveSig] int GetState(out int pRetVal);
    }

    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int pRetVal);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string Value, ref Guid EventContext);
        [PreserveSig] int GetGroupingParam(out Guid pRetVal);
        [PreserveSig] int SetGroupingParam(ref Guid Override, ref Guid EventContext);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr NewNotifications);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string pRetVal);
        [PreserveSig] int GetProcessId(out uint pRetVal);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference(int optOut);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int SessionCount);
        [PreserveSig] int GetSession(int SessionCount, out IAudioSessionControl Session);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr AudioSessionGuid, uint StreamFlags, out IntPtr SessionControl);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr AudioSessionGuid, uint StreamFlags, out IntPtr AudioVolume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
    }

    internal class WasapiEndpointCapturer
    {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
        private static extern int ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
            ref Guid riid,
            IntPtr activationParams,
            IActivateAudioInterfaceCompletionHandler completionHandler,
            out IActivateAudioInterfaceAsyncOperation createAsync);

        public IAudioClient Client;
        public IAudioCaptureClient Capture;
        public int Channels = 2;
        public int SampleRate = 48000;
        public int BlockAlign = 4;
        public int BitsPerSample = 16;
        public bool IsFloat = false;
        public bool IsAutoconvertPcm16 = true;
        public double ResampleAccum = 0.0;
        public Queue<short> SampleFifo = new Queue<short>(24000);

        private static IntPtr AllocPcm48kStereoWaveFormatEx()
        {
            // Standard 18-byte WAVEFORMATEX: PCM (1), 2 channels, 48000 Hz, 192000 avg bytes/sec, blockAlign=4, 16-bit, cbSize=0
            IntPtr pFmt = Marshal.AllocHGlobal(18);
            byte[] fmt = new byte[18];
            BitConverter.GetBytes((ushort)1).CopyTo(fmt, 0);       // wFormatTag = WAVE_FORMAT_PCM (1)
            BitConverter.GetBytes((ushort)2).CopyTo(fmt, 2);       // nChannels = 2
            BitConverter.GetBytes((uint)48000).CopyTo(fmt, 4);     // nSamplesPerSec = 48000
            BitConverter.GetBytes((uint)192000).CopyTo(fmt, 8);    // nAvgBytesPerSec = 48000 * 4
            BitConverter.GetBytes((ushort)4).CopyTo(fmt, 12);      // nBlockAlign = 4
            BitConverter.GetBytes((ushort)16).CopyTo(fmt, 14);     // wBitsPerSample = 16
            BitConverter.GetBytes((ushort)0).CopyTo(fmt, 16);      // cbSize = 0
            Marshal.Copy(fmt, 0, pFmt, 18);
            return pFmt;
        }

        // Windows 10/11 Per-Process Loopback Capturer (VAD\Process_Loopback):
        // - When includeTargetProcessTree == true (ProcessLoopbackMode = 0 = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE):
        //   Captures audio ONLY from targetPid and its child processes (100% isolated per-application audio!).
        // - When includeTargetProcessTree == false (ProcessLoopbackMode = 1 = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE):
        //   Captures system audio while excluding targetPid (used only when streaming Entire Screen).
        public static WasapiEndpointCapturer CreateProcessLoopbackForProcess(uint targetPid, bool includeTargetProcessTree)
        {
            if (targetPid == 0) return null;
            IntPtr pParams = IntPtr.Zero;
            IntPtr pPropVar = IntPtr.Zero;
            IntPtr pFmt = IntPtr.Zero;
            try
            {
                pParams = Marshal.AllocHGlobal(12);
                Marshal.WriteInt32(pParams, 0, 1); // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK = 1
                Marshal.WriteInt32(pParams, 4, (int)targetPid);
                Marshal.WriteInt32(pParams, 8, includeTargetProcessTree ? 0 : 1); // 0 = INCLUDE_TARGET_PROCESS_TREE, 1 = EXCLUDE_TARGET_PROCESS_TREE

                // PROPVARIANT (24 bytes on x64):
                //   offset 0: ushort vt = 65 (VT_BLOB)
                //   offset 8: uint cbSize = 12
                //   offset 16: IntPtr pBlobData = pParams
                pPropVar = Marshal.AllocHGlobal(24);
                for (int i = 0; i < 24; i++) Marshal.WriteByte(pPropVar, i, 0);
                Marshal.WriteInt16(pPropVar, 0, 65); // VT_BLOB
                Marshal.WriteInt32(pPropVar, 8, 12); // cbSize = 12
                Marshal.WriteIntPtr(pPropVar, 16, pParams);

                ProcessLoopbackCompletionHandler handler = new ProcessLoopbackCompletionHandler();
                Guid iidAudioClient = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
                IActivateAudioInterfaceAsyncOperation asyncOp = null;

                int hr = ActivateAudioInterfaceAsync(
                    "VAD\\Process_Loopback",
                    ref iidAudioClient,
                    pPropVar,
                    handler,
                    out asyncOp);

                if (hr < 0 || !handler.DoneEvent.WaitOne(1500) || handler.ActivatedClient == null)
                    return null;

                IAudioClient client = handler.ActivatedClient;
                pFmt = AllocPcm48kStereoWaveFormatEx();

                // AUDCLNT_STREAMFLAGS_LOOPBACK (0x00020000) | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM (0x80000000) | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY (0x08000000)
                uint flags = 0x88020000u;
                if (client.Initialize(0, flags, 5000000, 0, pFmt, IntPtr.Zero) < 0)
                    return null;

                Guid iidCap = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
                object objCap;
                if (client.GetService(ref iidCap, out objCap) < 0 || objCap == null)
                    return null;

                IAudioCaptureClient cap = (IAudioCaptureClient)objCap;
                if (client.Start() < 0)
                    return null;

                return new WasapiEndpointCapturer
                {
                    Client = client,
                    Capture = cap,
                    Channels = 2,
                    SampleRate = 48000,
                    BlockAlign = 4,
                    BitsPerSample = 16,
                    IsFloat = false,
                    IsAutoconvertPcm16 = true
                };
            }
            catch
            {
                return null;
            }
            finally
            {
                if (pFmt != IntPtr.Zero) Marshal.FreeHGlobal(pFmt);
                if (pPropVar != IntPtr.Zero) Marshal.FreeHGlobal(pPropVar);
                if (pParams != IntPtr.Zero) Marshal.FreeHGlobal(pParams);
            }
        }

        public static WasapiEndpointCapturer Create(IMMDevice dev)
        {
            if (dev == null) return null;
            IntPtr pFmt = IntPtr.Zero;
            try
            {
                Guid iidClient = new Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2");
                object objClient;
                if (dev.Activate(ref iidClient, 23, IntPtr.Zero, out objClient) < 0 || objClient == null)
                    return null;
                IAudioClient client = (IAudioClient)objClient;

                // First try initializing with AUTOCONVERTPCM (0x88020000) @ 48000Hz 16-bit Stereo PCM
                // so Windows' audio engine does all channel downmixing and sample rate conversion natively!
                pFmt = AllocPcm48kStereoWaveFormatEx();
                if (client.Initialize(0, 0x88020000u, 2500000, 0, pFmt, IntPtr.Zero) >= 0)
                {
                    Guid iidCap1 = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
                    object objCap1;
                    if (client.GetService(ref iidCap1, out objCap1) >= 0 && objCap1 != null)
                    {
                        IAudioCaptureClient cap1 = (IAudioCaptureClient)objCap1;
                        if (client.Start() >= 0)
                        {
                            return new WasapiEndpointCapturer
                            {
                                Client = client,
                                Capture = cap1,
                                Channels = 2,
                                SampleRate = 48000,
                                BlockAlign = 4,
                                BitsPerSample = 16,
                                IsFloat = false,
                                IsAutoconvertPcm16 = true
                            };
                        }
                    }
                }

                // Fallback to native GetMixFormat
                IntPtr mixFmtPtr = IntPtr.Zero;
                if (client.GetMixFormat(out mixFmtPtr) < 0 || mixFmtPtr == IntPtr.Zero)
                    return null;

                byte[] hdr = new byte[40];
                Marshal.Copy(mixFmtPtr, hdr, 0, 18);
                ushort formatTag = BitConverter.ToUInt16(hdr, 0);
                int channels = Math.Max(1, (int)BitConverter.ToUInt16(hdr, 2));
                int sampleRate = Math.Max(8000, (int)BitConverter.ToUInt32(hdr, 4));
                int blockAlign = Math.Max(2, (int)BitConverter.ToUInt16(hdr, 12));
                int bitsPerSample = (int)BitConverter.ToUInt16(hdr, 14);
                int cbSize = (int)BitConverter.ToUInt16(hdr, 16);

                bool isFloat = false;
                if (formatTag == 3) isFloat = true;
                else if (formatTag == 0xFFFE && cbSize >= 22)
                {
                    Marshal.Copy(mixFmtPtr, hdr, 0, 40);
                    uint subD1 = BitConverter.ToUInt32(hdr, 24);
                    isFloat = (subD1 == 3);
                }
                else isFloat = (bitsPerSample == 32);

                if (client.Initialize(0, 0x00020000u, 3000000, 0, mixFmtPtr, IntPtr.Zero) < 0)
                    return null;

                Guid iidCap = new Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317");
                object objCap;
                if (client.GetService(ref iidCap, out objCap) < 0 || objCap == null)
                    return null;
                IAudioCaptureClient cap = (IAudioCaptureClient)objCap;
                if (client.Start() < 0)
                    return null;

                return new WasapiEndpointCapturer
                {
                    Client = client,
                    Capture = cap,
                    Channels = channels,
                    SampleRate = sampleRate,
                    BlockAlign = blockAlign,
                    BitsPerSample = bitsPerSample,
                    IsFloat = isFloat,
                    IsAutoconvertPcm16 = false
                };
            }
            catch
            {
                return null;
            }
            finally
            {
                if (pFmt != IntPtr.Zero) Marshal.FreeHGlobal(pFmt);
            }
        }

        public void DrainPackets()
        {
            if (Capture == null) return;
            try
            {
                int safetyGuard = 250;
                while (safetyGuard-- > 0)
                {
                    uint packetSize = 0;
                    // MUST check == 0 (S_OK), because AUDCLNT_S_BUFFER_EMPTY is 0x08890001 (> 0)!
                    int hrNext = Capture.GetNextPacketSize(out packetSize);
                    if (hrNext != 0 || packetSize == 0)
                        break;

                    IntPtr dataPtr = IntPtr.Zero;
                    uint numFrames = 0;
                    uint flags = 0;
                    ulong devPos = 0, qpcPos = 0;
                    int hrBuf = Capture.GetBuffer(out dataPtr, out numFrames, out flags, out devPos, out qpcPos);
                    if (hrBuf != 0 || numFrames == 0)
                    {
                        if (hrBuf == 0 && numFrames > 0) Capture.ReleaseBuffer(numFrames);
                        break;
                    }

                    try
                    {
                        if (dataPtr != IntPtr.Zero && (flags & 2u) == 0 && numFrames <= 48000)
                        {
                            int totalBytes = (int)numFrames * BlockAlign;
                            byte[] raw = new byte[totalBytes];
                            Marshal.Copy(dataPtr, raw, 0, totalBytes);

                            if (IsAutoconvertPcm16)
                            {
                                for (int f = 0; f < (int)numFrames; f++)
                                {
                                    int off = f * 4;
                                    short l16 = BitConverter.ToInt16(raw, off);
                                    short r16 = BitConverter.ToInt16(raw, off + 2);
                                    if (SampleFifo.Count >= 24000)
                                    {
                                        SampleFifo.Dequeue();
                                        SampleFifo.Dequeue();
                                    }
                                    SampleFifo.Enqueue(l16);
                                    SampleFifo.Enqueue(r16);
                                }
                            }
                            else
                            {
                                double ratio = 48000.0 / (double)SampleRate;
                                for (int f = 0; f < (int)numFrames; f++)
                                {
                                    int fOff = f * BlockAlign;
                                    float l = 0f, r = 0f;
                                    if (IsFloat && BitsPerSample == 32)
                                    {
                                        float s0 = BitConverter.ToSingle(raw, fOff);
                                        float s1 = Channels >= 2 ? BitConverter.ToSingle(raw, fOff + 4) : s0;
                                        if (!float.IsNaN(s0) && !float.IsInfinity(s0)) l = s0;
                                        if (!float.IsNaN(s1) && !float.IsInfinity(s1)) r = s1;
                                        if (Channels >= 6 && fOff + 24 <= raw.Length)
                                        {
                                            float c = BitConverter.ToSingle(raw, fOff + 8);
                                            float bl = BitConverter.ToSingle(raw, fOff + 16);
                                            float br = BitConverter.ToSingle(raw, fOff + 20);
                                            if (!float.IsNaN(c) && !float.IsInfinity(c)) { l += c * 0.7071f; r += c * 0.7071f; }
                                            if (!float.IsNaN(bl) && !float.IsInfinity(bl)) l += bl * 0.7071f;
                                            if (!float.IsNaN(br) && !float.IsInfinity(br)) r += br * 0.7071f;
                                        }
                                    }
                                    else if (BitsPerSample == 16)
                                    {
                                        l = BitConverter.ToInt16(raw, fOff) / 32768f;
                                        r = (Channels >= 2 ? BitConverter.ToInt16(raw, fOff + 2) : BitConverter.ToInt16(raw, fOff)) / 32768f;
                                    }
                                    if (l > 1f) l = 1f; else if (l < -1f) l = -1f;
                                    if (r > 1f) r = 1f; else if (r < -1f) r = -1f;
                                    short l16 = (short)(l * 32767f);
                                    short r16 = (short)(r * 32767f);

                                    ResampleAccum += ratio;
                                    while (ResampleAccum >= 1.0)
                                    {
                                        ResampleAccum -= 1.0;
                                        if (SampleFifo.Count >= 24000)
                                        {
                                            SampleFifo.Dequeue();
                                            SampleFifo.Dequeue();
                                        }
                                        SampleFifo.Enqueue(l16);
                                        SampleFifo.Enqueue(r16);
                                    }
                                }
                            }
                        }
                    }
                    finally
                    {
                        Capture.ReleaseBuffer(numFrames);
                    }
                }
            }
            catch { }
        }

        public void Cleanup()
        {
            try { if (Client != null) Client.Stop(); } catch { }
            Client = null;
            Capture = null;
        }
    }

    public class DisCRustForm : Form
    {
        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int SetCurrentProcessExplicitAppUserModelID(string AppID);

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

        private void UpdateWindowRoundedCorners(bool isMaxOrFull)
        {
            try
            {
                if (!this.IsHandleCreated) return;
                int dark = 1;
                DwmSetWindowAttribute(this.Handle, 20, ref dark, 4);
                int cornerPref = isMaxOrFull ? 1 : 2; // 2 = DWMWCP_ROUND, 1 = DWMWCP_DONOTROUND
                DwmSetWindowAttribute(this.Handle, 33, ref cornerPref, 4);
                int borderCol = isMaxOrFull ? unchecked((int)0xFFFFFFFE) : 0x00383432;
                DwmSetWindowAttribute(this.Handle, 34, ref borderCol, 4);
                if (webView != null && webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.ExecuteScriptAsync("window.__lcSetWindowMaximizedState&&window.__lcSetWindowMaximizedState(" + (isMaxOrFull ? "true" : "false") + ");");
                }
            }
            catch { }
        }

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsIconic(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsHungAppWindow(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool DestroyIcon(IntPtr hIcon);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr SendMessageTimeoutW(IntPtr hWnd, uint Msg, IntPtr wParam, StringBuilder lParam, uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassNameW(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern long GetWindowLongPtrW(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern long SetWindowLongPtrW(IntPtr hWnd, int nIndex, long dwNewLong);

        [DllImport("user32.dll")]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern bool EnumChildWindows(IntPtr hWndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32FirstW(IntPtr hSnapshot, ref PROCESSENTRY32W lppe);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool Process32NextW(IntPtr hSnapshot, ref PROCESSENTRY32W lppe);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct PROCESSENTRY32W
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        private sealed class CapturableWindowEntry
        {
            public long Hwnd;
            public uint Pid;
            public uint RootPid;
            public string Title;
            public string Exe;
            public int Width;
            public int Height;
            public bool HasAudio;
        }

        [DllImport("kernel32.dll")]
        private static extern bool SetProcessWorkingSetSize(IntPtr proc, IntPtr min, IntPtr max);

        [DllImport("psapi.dll")]
        private static extern bool EmptyWorkingSet(IntPtr hProcess);

        [DllImport("kernel32.dll", EntryPoint = "K32EmptyWorkingSet")]
        private static extern bool K32EmptyWorkingSet(IntPtr hProcess);

        [DllImport("kernel32.dll")]
        private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

        private void TrimAllWebViewAndHostMemory()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    long hostBytes = 0;
                    long wvBytes = 0;
                    Process curP = Process.GetCurrentProcess();
                    if (!loopbackActive)
                    {
                        try { K32EmptyWorkingSet(curP.Handle); } catch { try { EmptyWorkingSet(curP.Handle); } catch { } }
                        try { SetProcessWorkingSetSize(curP.Handle, (IntPtr)(-1), (IntPtr)(-1)); } catch { }
                    }
                    curP.Refresh();
                    hostBytes = curP.WorkingSet64;

                    // Compact all WebView2 processes (WebView2: Discord #chat renderer, GPU, Manager, Network, Storage)
                    // using PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA (0x1100) so sandboxed renderers succeed!
                    Process[] wvProcs = Process.GetProcessesByName("msedgewebview2");
                    foreach (Process wp in wvProcs)
                    {
                        try
                        {
                            IntPtr h = OpenProcess(0x1100u, false, wp.Id);
                            if (h == IntPtr.Zero) h = OpenProcess(0x0500u, false, wp.Id);
                            if (h != IntPtr.Zero)
                            {
                                try
                                {
                                    try { K32EmptyWorkingSet(h); } catch { try { EmptyWorkingSet(h); } catch { } }
                                    SetProcessWorkingSetSize(h, (IntPtr)(-1), (IntPtr)(-1));
                                }
                                finally
                                {
                                    CloseHandle(h);
                                }
                            }
                            wp.Refresh();
                            wvBytes += wp.WorkingSet64;
                        }
                        catch { }
                        finally
                        {
                            try { wp.Dispose(); } catch { }
                        }
                    }

                    long hostMb = Math.Max(8, hostBytes / (1024 * 1024));
                    long totalMb = Math.Max(hostMb + 24, (hostBytes + wvBytes) / (1024 * 1024));
                    if (this.IsHandleCreated && webView != null)
                    {
                        this.BeginInvoke((Action)(() =>
                        {
                            try
                            {
                                if (webView.CoreWebView2 != null)
                                    webView.CoreWebView2.ExecuteScriptAsync("window.__litecordUpdateNativeRam&&window.__litecordUpdateNativeRam(" + totalMb + "," + hostMb + ");");
                            }
                            catch { }
                        }));
                    }
                }
                catch { }
            });
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left, Top, Right, Bottom;
        }

        public const string APP_VERSION = "0.6.6";
        public const string INSTALLER_VERSION = "6.6.0";
        public const string AUMID = "VoxMortis.DisCRust.Client.v066";

        private WebView2 webView;
        private string dataRoot;
        private string installDir;
        private string configPath;
        private string mirrorPath;
        private string injectedJsTemplate;
        private NotifyIcon trayNotify;
        private volatile bool loopbackActive = false;

        // Window Drag, Resize, and WorkArea Maximize State
        private bool isWorkAreaMaximized = false;
        private Rectangle normalRestoreBounds = new Rectangle(120, 80, 1360, 840);
        private int savedWidth = 1360;
        private int savedHeight = 840;
        private int currentUiScaleStep = 0;
        private System.Windows.Forms.Timer dragResizeTimer;
        private int dragOrResizeMode = 0; // 0 = none, 1 = drag, 2 = resize
        private string activeResizeDir = "";
        private Point dragStartCursor;
        private Rectangle dragStartBounds;
        private System.Windows.Forms.Timer popupSuppressTimer;

        public DisCRustForm()
        {
            try { SetCurrentProcessExplicitAppUserModelID(AUMID); } catch { }
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            dataRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DisLiteRust01");
            Directory.CreateDirectory(dataRoot);
            installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            configPath = Path.Combine(dataRoot, "config.json");
            mirrorPath = Path.Combine(dataRoot, "storage_mirror.json");

            LoadSavedWindowMetricsFromConfig();
            RegisterInstalledAppAndPermissions();

            this.Text = "DisCRust v0.6.6";
            this.FormBorderStyle = FormBorderStyle.None;
            this.TopMost = false; // Never overlap other apps!
            this.BackColor = Color.FromArgb(30, 31, 34);
            this.MinimumSize = new Size(720, 480);

            Screen curScreen = Screen.FromPoint(Cursor.Position);
            Rectangle workArea = curScreen.WorkingArea;
            int w = Math.Min(Math.Max(720, savedWidth), workArea.Width);
            int h = Math.Min(Math.Max(480, savedHeight), workArea.Height);
            int startX = workArea.Left + (workArea.Width - w) / 2;
            int startY = workArea.Top + (workArea.Height - h) / 2;
            normalRestoreBounds = new Rectangle(startX, startY, w, h);

            if (isWorkAreaMaximized)
            {
                this.StartPosition = FormStartPosition.Manual;
                this.Bounds = workArea;
            }
            else
            {
                this.StartPosition = FormStartPosition.Manual;
                this.Bounds = normalRestoreBounds;
            }

            string icoPath = Path.Combine(installDir, "discrust.ico");
            if (!File.Exists(icoPath)) icoPath = Path.Combine(installDir, "dislite.ico");
            if (!File.Exists(icoPath)) icoPath = Path.Combine(dataRoot, "dislite.ico");
            if (File.Exists(icoPath))
            {
                try { this.Icon = new Icon(icoPath); baseAppIcon = this.Icon; } catch { }
            }

            trayNotify = new NotifyIcon();
            if (this.Icon != null) trayNotify.Icon = this.Icon;
            trayNotify.Text = "DisCRust v0.6.6";
            trayNotify.Visible = true;
            trayNotify.Click += (s, e) => RestoreAndFocusWindow();
            trayNotify.BalloonTipClicked += (s, e) => RestoreAndFocusWindow();

            string jsPath = Path.Combine(installDir, "src", "injected_engine.js");
            if (!File.Exists(jsPath)) jsPath = Path.Combine(dataRoot, "src", "injected_engine.js");
            if (File.Exists(jsPath))
            {
                injectedJsTemplate = File.ReadAllText(jsPath, Encoding.UTF8);
            }
            if (string.IsNullOrEmpty(injectedJsTemplate))
            {
                try
                {
                    using (Stream rs = Assembly.GetExecutingAssembly().GetManifestResourceStream("injected_engine.js"))
                    {
                        if (rs != null)
                        {
                            using (StreamReader sr = new StreamReader(rs, Encoding.UTF8))
                            {
                                injectedJsTemplate = sr.ReadToEnd();
                            }
                        }
                    }
                }
                catch { }
            }

            webView = new WebView2();
            webView.Dock = DockStyle.Fill;
            webView.DefaultBackgroundColor = Color.FromArgb(30, 31, 34);
            this.Controls.Add(webView);

            dragResizeTimer = new System.Windows.Forms.Timer();
            dragResizeTimer.Interval = 8;
            dragResizeTimer.Tick += OnDragOrResizeTick;

            int bgTickCounter = 0;
            popupSuppressTimer = new System.Windows.Forms.Timer();
            popupSuppressTimer.Interval = 180;
            popupSuppressTimer.Tick += (s, e) =>
            {
                SuppressWebViewScreenSharePopups();
                bgTickCounter++;
                if (bgTickCounter == 18 || bgTickCounter % 38 == 0)
                {
                    TrimAllWebViewAndHostMemory();
                }
            };
            popupSuppressTimer.Start();

            this.Load += async (s, e) => { UpdateWindowRoundedCorners(isWorkAreaMaximized); await InitializeWebViewAsync(); };
            this.FormClosing += (s, e) =>
            {
                loopbackActive = false;
                try { if (popupSuppressTimer != null) popupSuppressTimer.Stop(); } catch { }
                try { if (trayNotify != null) trayNotify.Visible = false; } catch { }
            };
        }

        protected override CreateParams CreateParams
        {
            get
            {
                CreateParams cp = base.CreateParams;
                cp.Style |= 0x00020000 | 0x00040000 | 0x00010000; // WS_MINIMIZEBOX | WS_SIZEBOX | WS_MAXIMIZEBOX
                return cp;
            }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == 0x0083) // WM_NCCALCSIZE - strip white top frame on frameless window
            {
                m.Result = IntPtr.Zero;
                return;
            }
            base.WndProc(ref m);
        }

        private int ReadJsonInt(string json, string key, int defVal)
        {
            if (string.IsNullOrEmpty(json)) return defVal;
            Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?\\d+)");
            int v;
            if (m.Success && int.TryParse(m.Groups[1].Value, out v)) return v;
            return defVal;
        }

        private bool ReadJsonBool(string json, string key, bool defVal)
        {
            if (string.IsNullOrEmpty(json)) return defVal;
            Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(true|false)", RegexOptions.IgnoreCase);
            if (m.Success) return string.Equals(m.Groups[1].Value, "true", StringComparison.OrdinalIgnoreCase);
            return defVal;
        }

        private string SanitizeJsonOrDefault(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "{}";
            string s = raw.Trim('\uFEFF', ' ', '\t', '\r', '\n');
            if (!s.StartsWith("{") || !s.EndsWith("}")) return "{}";
            int saIdx = s.IndexOf("\"SavedAccounts\"");
            if (saIdx >= 0)
            {
                int colon = s.IndexOf(':', saIdx);
                if (colon > saIdx)
                {
                    int arrStart = s.IndexOf('[', colon);
                    if (arrStart > colon)
                    {
                        int depth = 0;
                        bool inStr = false;
                        bool esc = false;
                        int arrEnd = -1;
                        for (int i = arrStart; i < s.Length; i++)
                        {
                            char c = s[i];
                            if (esc) { esc = false; continue; }
                            if (c == '\\') { esc = true; continue; }
                            if (c == '"') { inStr = !inStr; continue; }
                            if (!inStr)
                            {
                                if (c == '[') depth++;
                                else if (c == ']')
                                {
                                    depth--;
                                    if (depth == 0) { arrEnd = i; break; }
                                }
                            }
                        }
                        if (arrEnd > arrStart)
                        {
                            string after = s.Substring(arrEnd + 1);
                            Match nextProp = Regex.Match(after, @"^\s*,\s*""[A-Za-z0-9_]+""\s*:\s*[^\]}]+\]\}");
                            if (nextProp.Success)
                            {
                                s = s.Substring(0, saIdx).TrimEnd(' ', '\t', '\r', '\n', ',') + "\n}";
                            }
                        }
                    }
                }
            }
            return s;
        }

        private string RemoveJsonKeyIfPresent(string json, string key)
        {
            string keyToken = "\"" + key + "\"";
            int idx = json.IndexOf(keyToken, StringComparison.Ordinal);
            if (idx < 0) return json;
            int colon = json.IndexOf(':', idx + keyToken.Length);
            if (colon < 0) return json;
            int valStart = colon + 1;
            while (valStart < json.Length && char.IsWhiteSpace(json[valStart])) valStart++;
            if (valStart >= json.Length) return json;

            int valEnd = valStart;
            char first = json[valStart];
            if (first == '"')
            {
                bool esc = false;
                for (int i = valStart + 1; i < json.Length; i++)
                {
                    if (esc) { esc = false; continue; }
                    if (json[i] == '\\') { esc = true; continue; }
                    if (json[i] == '"') { valEnd = i + 1; break; }
                }
            }
            else if (first == '[' || first == '{')
            {
                char openC = first;
                char closeC = first == '[' ? ']' : '}';
                int depth = 0;
                bool inStr = false;
                bool esc = false;
                for (int i = valStart; i < json.Length; i++)
                {
                    char c = json[i];
                    if (esc) { esc = false; continue; }
                    if (c == '\\') { esc = true; continue; }
                    if (c == '"') { inStr = !inStr; continue; }
                    if (!inStr)
                    {
                        if (c == openC) depth++;
                        else if (c == closeC)
                        {
                            depth--;
                            if (depth == 0) { valEnd = i + 1; break; }
                        }
                    }
                }
            }
            else
            {
                while (valEnd < json.Length && json[valEnd] != ',' && json[valEnd] != '}' && json[valEnd] != '\r' && json[valEnd] != '\n')
                    valEnd++;
            }

            int removeStart = idx;
            while (removeStart > 1 && (json[removeStart - 1] == ' ' || json[removeStart - 1] == '\t' || json[removeStart - 1] == '\r' || json[removeStart - 1] == '\n'))
                removeStart--;
            if (removeStart > 1 && json[removeStart - 1] == ',')
            {
                removeStart--;
            }
            else
            {
                while (valEnd < json.Length && (json[valEnd] == ' ' || json[valEnd] == '\t' || json[valEnd] == '\r' || json[valEnd] == '\n'))
                    valEnd++;
                if (valEnd < json.Length && json[valEnd] == ',')
                    valEnd++;
            }
            return json.Substring(0, removeStart) + json.Substring(valEnd);
        }

        private string WriteJsonField(string json, string key, string rawValLiteral)
        {
            json = SanitizeJsonOrDefault(json);
            json = RemoveJsonKeyIfPresent(json, key);
            int lastBrace = json.LastIndexOf('}');
            if (lastBrace > 0)
            {
                string prefix = json.Substring(0, lastBrace).TrimEnd();
                bool hasProps = prefix.Length > 1;
                return prefix + (hasProps ? ",\n  \"" : "\n  \"") + key + "\": " + rawValLiteral + "\n}";
            }
            return "{\"" + key + "\": " + rawValLiteral + "}";
        }

        private void LoadSavedWindowMetricsFromConfig()
        {
            try
            {
                if (File.Exists(configPath))
                {
                    string raw = File.ReadAllText(configPath, Encoding.UTF8);
                    savedWidth = Math.Max(720, ReadJsonInt(raw, "SavedWindowWidth", 1360));
                    savedHeight = Math.Max(480, ReadJsonInt(raw, "SavedWindowHeight", 840));
                    isWorkAreaMaximized = ReadJsonBool(raw, "SavedWindowMaximized", false);
                    currentUiScaleStep = Math.Max(-10, Math.Min(10, ReadJsonInt(raw, "DiscordUiScaleStep", 0)));
                }
            }
            catch { }
        }

        private void SaveWindowMetricsToConfig()
        {
            try
            {
                string raw = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
                raw = WriteJsonField(raw, "SavedWindowWidth", savedWidth.ToString());
                raw = WriteJsonField(raw, "SavedWindowHeight", savedHeight.ToString());
                raw = WriteJsonField(raw, "SavedWindowMaximized", isWorkAreaMaximized ? "true" : "false");
                raw = WriteJsonField(raw, "DiscordUiScaleStep", currentUiScaleStep.ToString());
                File.WriteAllText(configPath, raw, Encoding.UTF8);
            }
            catch { }
        }

        private void ToggleBooleanConfigKey(string key, bool defVal = true)
        {
            try
            {
                string raw = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
                bool cur = ReadJsonBool(raw, key, defVal);
                raw = WriteJsonField(raw, key, (!cur) ? "true" : "false");
                File.WriteAllText(configPath, raw, Encoding.UTF8);
                SyncConfigToWebView(raw);
            }
            catch { }
        }

        private void SetConfigLiteral(string key, string rawValLiteral)
        {
            try
            {
                string raw = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
                raw = WriteJsonField(raw, key, rawValLiteral);
                File.WriteAllText(configPath, raw, Encoding.UTF8);
                SyncConfigToWebView(raw);
            }
            catch { }
        }

        private void SyncConfigToWebView(string cfgJson = null)
        {
            try
            {
                if (cfgJson == null)
                    cfgJson = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
                if (webView != null && webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.ExecuteScriptAsync("window.__litecordApplyConfig&&window.__litecordApplyConfig(" + cfgJson + ");");
                }
            }
            catch { }
        }

        private void ToggleWorkAreaMaximize()
        {
            this.TopMost = false;
            if (this.WindowState == FormWindowState.Maximized)
                this.WindowState = FormWindowState.Normal;

            if (!isWorkAreaMaximized)
            {
                normalRestoreBounds = this.Bounds;
                isWorkAreaMaximized = true;
                Rectangle wa = Screen.FromHandle(this.Handle).WorkingArea;
                this.Bounds = wa;
            }
            else
            {
                isWorkAreaMaximized = false;
                if (normalRestoreBounds.Width >= 720 && normalRestoreBounds.Height >= 480)
                    this.Bounds = normalRestoreBounds;
                else
                    this.Bounds = new Rectangle(120, 80, 1360, 840);
            }
            UpdateWindowRoundedCorners(isWorkAreaMaximized);
            SaveWindowMetricsToConfig();
        }

        private void OnDragOrResizeTick(object sender, EventArgs e)
        {
            bool leftDown = (GetAsyncKeyState(0x01) & 0x8000) != 0;
            if (!leftDown)
            {
                dragResizeTimer.Stop();
                dragOrResizeMode = 0;
                if (!isWorkAreaMaximized && this.Width >= 720 && this.Height >= 480)
                {
                    savedWidth = this.Width;
                    savedHeight = this.Height;
                    normalRestoreBounds = this.Bounds;
                    SaveWindowMetricsToConfig();
                }
                return;
            }

            Point cur = Cursor.Position;
            int dx = cur.X - dragStartCursor.X;
            int dy = cur.Y - dragStartCursor.Y;

            if (dragOrResizeMode == 1) // Window Drag
            {
                if (isWorkAreaMaximized)
                {
                    if (Math.Abs(dx) > 4 || Math.Abs(dy) > 4)
                    {
                        isWorkAreaMaximized = false;
                        int rw = Math.Max(720, normalRestoreBounds.Width);
                        int rh = Math.Max(480, normalRestoreBounds.Height);
                        int rx = cur.X - (rw / 2);
                        int ry = Math.Max(0, cur.Y - 18);
                        dragStartBounds = new Rectangle(rx, ry, rw, rh);
                        dragStartCursor = cur;
                        this.Bounds = dragStartBounds;
                    }
                    return;
                }
                this.Location = new Point(dragStartBounds.Left + dx, dragStartBounds.Top + dy);
            }
            else if (dragOrResizeMode == 2) // 8-Way Edge/Corner Resize
            {
                int l = dragStartBounds.Left;
                int t = dragStartBounds.Top;
                int w = dragStartBounds.Width;
                int h = dragStartBounds.Height;

                if (activeResizeDir.Contains("e")) w = Math.Max(720, dragStartBounds.Width + dx);
                if (activeResizeDir.Contains("s")) h = Math.Max(480, dragStartBounds.Height + dy);
                if (activeResizeDir.Contains("w"))
                {
                    int nw = Math.Max(720, dragStartBounds.Width - dx);
                    l = dragStartBounds.Right - nw;
                    w = nw;
                }
                if (activeResizeDir.Contains("n"))
                {
                    int nh = Math.Max(480, dragStartBounds.Height - dy);
                    t = dragStartBounds.Bottom - nh;
                    h = nh;
                }
                this.Bounds = new Rectangle(l, t, w, h);
            }
        }

        private static string GetWindowTitleSafeNonBlocking(IntPtr hwnd)
        {
            if (hwnd == IntPtr.Zero || IsHungAppWindow(hwnd)) return "";
            StringBuilder sb = new StringBuilder(256);
            IntPtr res;
            // WM_GETTEXT = 0x000D, SMTO_ABORTIFHUNG = 0x0002, 12ms timeout so it NEVER blocks!
            if (SendMessageTimeoutW(hwnd, 0x000D, (IntPtr)255, sb, 0x0002, 12, out res) != IntPtr.Zero)
            {
                return sb.ToString();
            }
            return "";
        }

        private void SuppressWebViewScreenSharePopups()
        {
            try
            {
                IntPtr mainH = this.IsHandleCreated ? this.Handle : IntPtr.Zero;
                EnumWindows((hwnd, lParam) =>
                {
                    if (hwnd == IntPtr.Zero || hwnd == mainH) return true;
                    if (!IsWindowVisible(hwnd) || IsHungAppWindow(hwnd)) return true;

                    long exStyle = GetWindowLongPtrW(hwnd, -20);
                    bool isTopmost = (exStyle & 0x00000008L) != 0;

                    RECT r;
                    if (!GetWindowRect(hwnd, out r)) return true;
                    int w = Math.Abs(r.Right - r.Left);
                    int h = Math.Abs(r.Bottom - r.Top);

                    // Fast size pre-filter before querying window text!
                    if (w < 160 || w > 900 || h < 20 || h > 180) return true;

                    StringBuilder cls = new StringBuilder(128);
                    GetClassNameW(hwnd, cls, 127);
                    string clsName = cls.ToString();
                    if (!clsName.StartsWith("Chrome_WidgetWin_")) return true;

                    string titleLower = GetWindowTitleSafeNonBlocking(hwnd).ToLowerInvariant();
                    bool isSharingBanner = titleLower.Contains("is sharing your screen")
                        || titleLower.Contains("is sharing a window")
                        || titleLower.Contains("is sharing a tab")
                        || titleLower.Contains("is sharing your")
                        || titleLower.Contains("screen sharing")
                        || (isTopmost && w >= 240 && w <= 740 && h >= 28 && h <= 125 && string.IsNullOrEmpty(titleLower));

                    if (isSharingBanner)
                    {
                        SetWindowLongPtrW(hwnd, -20, (exStyle | 0x00000080L) & ~0x00000008L);
                        SetWindowPos(hwnd, IntPtr.Zero, -32000, -32000, 0, 0, 0x0001 | 0x0004 | 0x0010);
                        ShowWindow(hwnd, 0);
                    }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
        }

        private void PrepareWindowsForScreenSharePicker()
        {
            try
            {
                IntPtr mainH = this.IsHandleCreated ? this.Handle : IntPtr.Zero;
                EnumWindows((hwnd, lParam) =>
                {
                    if (hwnd == IntPtr.Zero || hwnd == mainH) return true;
                    if (!IsWindowVisible(hwnd) || IsHungAppWindow(hwnd)) return true;

                    StringBuilder cls = new StringBuilder(128);
                    GetClassNameW(hwnd, cls, 127);
                    string clsLower = cls.ToString().ToLowerInvariant();

                    RECT r;
                    GetWindowRect(hwnd, out r);
                    int w = Math.Abs(r.Right - r.Left);
                    int h = Math.Abs(r.Bottom - r.Top);

                    long style = GetWindowLongPtrW(hwnd, -16);
                    long exStyle = GetWindowLongPtrW(hwnd, -20);

                    string titleLower = GetWindowTitleSafeNonBlocking(hwnd).ToLowerInvariant();
                    bool isBorderlessLayeredGadget = (style & 0x00C00000L) == 0
                        && ((exStyle & 0x08000000L) != 0 || (exStyle & 0x00000020L) != 0 || (exStyle & 0x00080000L) != 0);

                    bool isWidgetOrMonitor = string.IsNullOrEmpty(titleLower)
                        || isBorderlessLayeredGadget
                        || clsLower.Contains("rainmeter")
                        || clsLower.Contains("meterwindow")
                        || clsLower.Contains("rzmonitor")
                        || clsLower.Contains("razer")
                        || clsLower == "workerw"
                        || clsLower == "progman"
                        || clsLower == "syndicate"
                        || titleLower.Contains("rzmonitor")
                        || titleLower.Contains("rainmeter")
                        || titleLower.Contains("nvidia geforce overlay")
                        || titleLower.Contains("windows input experience")
                        || titleLower.Contains("program manager")
                        || (w > 0 && h > 0 && (w < 240 || h < 160) && !IsIconic(hwnd));

                    if (isWidgetOrMonitor && (exStyle & 0x00000080L) == 0)
                    {
                        SetWindowLongPtrW(hwnd, -20, (exStyle | 0x00000080L) & ~0x00040000L);
                    }
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
        }

        private void UnifyActiveWindowsOutputEndpoints()
        {
            try
            {
                IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDeviceCollection collection;
                string bestDevId = null;
                float bestPeak = 0.0005f;

                if (enumerator.EnumAudioEndpoints(0, 1, out collection) >= 0 && collection != null)
                {
                    uint count = 0;
                    if (collection.GetCount(out count) >= 0)
                    {
                        for (uint i = 0; i < count; i++)
                        {
                            IMMDevice dev;
                            if (collection.Item(i, out dev) >= 0 && dev != null)
                            {
                                try
                                {
                                    Guid iidMeter = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
                                    object objMeter;
                                    if (dev.Activate(ref iidMeter, 23, IntPtr.Zero, out objMeter) >= 0 && objMeter != null)
                                    {
                                        IAudioMeterInformation meter = (IAudioMeterInformation)objMeter;
                                        float pk = 0f;
                                        for (int s = 0; s < 3; s++)
                                        {
                                            float p;
                                            if (meter.GetPeakValue(out p) >= 0 && p > pk) pk = p;
                                            Thread.Sleep(5);
                                        }
                                        if (pk > bestPeak)
                                        {
                                            string idStr;
                                            if (dev.GetId(out idStr) >= 0 && !string.IsNullOrEmpty(idStr))
                                            {
                                                bestPeak = pk;
                                                bestDevId = idStr;
                                            }
                                        }
                                    }
                                }
                                catch { }
                            }
                        }
                    }
                }

                if (string.IsNullOrEmpty(bestDevId))
                {
                    IMMDevice defDev;
                    if (enumerator.GetDefaultAudioEndpoint(0, 0, out defDev) >= 0 && defDev != null)
                    {
                        defDev.GetId(out bestDevId);
                    }
                }

                if (!string.IsNullOrEmpty(bestDevId))
                {
                    IPolicyConfigWin10 pc = (IPolicyConfigWin10)(new PolicyConfigClientComObject());
                    pc.SetDefaultEndpoint(bestDevId, 0); // eConsole
                    pc.SetDefaultEndpoint(bestDevId, 1); // eMultimedia
                    pc.SetDefaultEndpoint(bestDevId, 2); // eCommunications
                }
            }
            catch { }
        }

        private void RegisterInstalledAppAndPermissions()
        {
            string exePath = Application.ExecutablePath;
            try
            {
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Software\Classes\AppUserModelId\" + AUMID))
                {
                    if (k != null)
                    {
                        k.SetValue("DisplayName", "DisCRust", RegistryValueKind.String);
                        k.SetValue("IconBackgroundColor", "FF1E1F22", RegistryValueKind.String);
                    }
                }
                using (RegistryKey u = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\DisCRust"))
                {
                    if (u != null)
                    {
                        u.SetValue("DisplayName", "DisCRust", RegistryValueKind.String);
                        u.SetValue("DisplayVersion", APP_VERSION, RegistryValueKind.String);
                        u.SetValue("Publisher", "DisCRust Project", RegistryValueKind.String);
                        u.SetValue("InstallLocation", installDir, RegistryValueKind.String);
                        u.SetValue("DisplayIcon", exePath + ",0", RegistryValueKind.String);
                        u.SetValue("UninstallString", "cmd.exe /c rmdir /s /q \"" + installDir + "\"", RegistryValueKind.String);
                        u.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        u.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                        u.SetValue("EstimatedSize", 18432, RegistryValueKind.DWord);
                    }
                }
                string nonPkgId = exePath.Replace('\\', '#');
                foreach (string cap in new[] { "microphone", "webcam" })
                {
                    using (RegistryKey ck = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\" + cap + @"\NonPackaged\" + nonPkgId))
                    {
                        if (ck != null) ck.SetValue("Value", "Allow", RegistryValueKind.String);
                    }
                }
            }
            catch { }
        }

        private int ipcAudioBusy = 0;
        private int currentLoopbackSessionId = 0;
        private Icon baseAppIcon = null;

        private static Dictionary<uint, Tuple<uint, string>> GetSystemProcessTable()
        {
            var map = new Dictionary<uint, Tuple<uint, string>>();
            IntPtr snap = CreateToolhelp32Snapshot(0x00000002u, 0);
            if (snap == IntPtr.Zero || snap == (IntPtr)(-1)) return map;
            try
            {
                PROCESSENTRY32W pe = new PROCESSENTRY32W();
                pe.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
                if (Process32FirstW(snap, ref pe))
                {
                    do
                    {
                        string exe = (pe.szExeFile ?? "").Trim();
                        map[pe.th32ProcessID] = Tuple.Create(pe.th32ParentProcessID, exe);
                    } while (Process32NextW(snap, ref pe));
                }
            }
            catch { }
            finally
            {
                CloseHandle(snap);
            }
            return map;
        }

        private static uint ResolveRootProcessForSameExe(uint pid, Dictionary<uint, Tuple<uint, string>> procMap, out string exeName)
        {
            exeName = "";
            if (pid == 0 || !procMap.ContainsKey(pid)) return pid;
            exeName = procMap[pid].Item2 ?? "";
            string targetExeLower = exeName.ToLowerInvariant();
            uint cur = pid;
            for (int depth = 0; depth < 16; depth++)
            {
                if (!procMap.ContainsKey(cur)) break;
                uint parentPid = procMap[cur].Item1;
                if (parentPid == 0 || parentPid == cur || !procMap.ContainsKey(parentPid)) break;
                string parentExeLower = (procMap[parentPid].Item2 ?? "").ToLowerInvariant();
                if (parentExeLower == targetExeLower && !string.IsNullOrEmpty(targetExeLower))
                {
                    cur = parentPid;
                }
                else
                {
                    break;
                }
            }
            return cur;
        }

        private static uint UnwrapWindowProcessId(IntPtr hwnd, Dictionary<uint, Tuple<uint, string>> procMap)
        {
            if (hwnd == IntPtr.Zero) return 0;
            uint pid = 0;
            GetWindowThreadProcessId(hwnd, out pid);
            if (pid == 0) return 0;
            if (procMap != null && procMap.ContainsKey(pid))
            {
                string exeLower = (procMap[pid].Item2 ?? "").ToLowerInvariant();
                if (exeLower == "applicationframehost.exe")
                {
                    uint childRealPid = 0;
                    EnumChildWindows(hwnd, (ch, lParam) =>
                    {
                        uint cPid = 0;
                        GetWindowThreadProcessId(ch, out cPid);
                        if (cPid != 0 && cPid != pid)
                        {
                            childRealPid = cPid;
                            return false;
                        }
                        return true;
                    }, IntPtr.Zero);
                    if (childRealPid != 0) return childRealPid;
                }
            }
            return pid;
        }

        private static HashSet<uint> GetActiveAudioSessionProcessIds()
        {
            var activePids = new HashSet<uint>();
            try
            {
                IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                IMMDeviceCollection collection;
                if (enumerator.EnumAudioEndpoints(0, 1, out collection) >= 0 && collection != null)
                {
                    uint count = 0;
                    if (collection.GetCount(out count) >= 0)
                    {
                        Guid iidMgr2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
                        for (uint i = 0; i < count; i++)
                        {
                            IMMDevice dev;
                            if (collection.Item(i, out dev) >= 0 && dev != null)
                            {
                                object objMgr;
                                if (dev.Activate(ref iidMgr2, 23, IntPtr.Zero, out objMgr) >= 0 && objMgr != null)
                                {
                                    IAudioSessionManager2 mgr = objMgr as IAudioSessionManager2;
                                    if (mgr != null)
                                    {
                                        IAudioSessionEnumerator sesEnum;
                                        if (mgr.GetSessionEnumerator(out sesEnum) >= 0 && sesEnum != null)
                                        {
                                            int sesCount = 0;
                                            if (sesEnum.GetCount(out sesCount) >= 0)
                                            {
                                                for (int s = 0; s < sesCount; s++)
                                                {
                                                    IAudioSessionControl ctrl;
                                                    if (sesEnum.GetSession(s, out ctrl) >= 0 && ctrl != null)
                                                    {
                                                        int state = 0;
                                                        ctrl.GetState(out state);
                                                        IAudioSessionControl2 ctrl2 = ctrl as IAudioSessionControl2;
                                                        if (ctrl2 != null)
                                                        {
                                                            uint sPid = 0;
                                                            if (ctrl2.GetProcessId(out sPid) >= 0 && sPid != 0)
                                                            {
                                                                if (state == 1) activePids.Add(sPid);
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            catch { }
            return activePids;
        }

        private List<CapturableWindowEntry> ScanCapturableApplicationWindows()
        {
            var results = new List<CapturableWindowEntry>();
            try
            {
                uint myPid = (uint)Process.GetCurrentProcess().Id;
                IntPtr mainH = this.IsHandleCreated ? this.Handle : IntPtr.Zero;
                var procMap = GetSystemProcessTable();
                var activeAudioPids = GetActiveAudioSessionProcessIds();

                var activeAudioRootPids = new HashSet<uint>(activeAudioPids);
                var activeAudioExes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (uint apid in activeAudioPids)
                {
                    string aExe;
                    uint aRoot = ResolveRootProcessForSameExe(apid, procMap, out aExe);
                    if (aRoot != 0) activeAudioRootPids.Add(aRoot);
                    if (!string.IsNullOrEmpty(aExe)) activeAudioExes.Add(aExe);
                }

                EnumWindows((hwnd, lParam) =>
                {
                    if (hwnd == IntPtr.Zero || hwnd == mainH) return true;
                    if (!IsWindowVisible(hwnd) || IsHungAppWindow(hwnd)) return true;

                    uint pid = UnwrapWindowProcessId(hwnd, procMap);
                    if (pid == 0 || pid == myPid) return true;

                    StringBuilder cls = new StringBuilder(128);
                    GetClassNameW(hwnd, cls, 127);
                    string clsLower = cls.ToString().ToLowerInvariant();
                    if (clsLower == "progman" || clsLower == "workerw" || clsLower == "shell_traywnd"
                        || clsLower.Contains("rainmeter") || clsLower.Contains("meterwindow") || clsLower.Contains("rzmonitor"))
                        return true;

                    long exStyle = GetWindowLongPtrW(hwnd, -20);
                    if ((exStyle & 0x00000080L) != 0) return true;

                    string title = GetWindowTitleSafeNonBlocking(hwnd).Trim();
                    if (string.IsNullOrEmpty(title)) return true;
                    string titleLower = title.ToLowerInvariant();
                    if (titleLower == "program manager" || titleLower == "windows input experience"
                        || titleLower == "nvidia geforce overlay" || titleLower.Contains("is sharing a window")
                        || titleLower.Contains("is sharing your screen"))
                        return true;

                    RECT r;
                    GetWindowRect(hwnd, out r);
                    int w = Math.Abs(r.Right - r.Left);
                    int h = Math.Abs(r.Bottom - r.Top);
                    if (!IsIconic(hwnd) && (w < 200 || h < 120)) return true;

                    string exeName;
                    uint rootPid = ResolveRootProcessForSameExe(pid, procMap, out exeName);
                    if (string.IsNullOrEmpty(exeName)) exeName = "Application.exe";
                    string exeLower = exeName.ToLowerInvariant();
                    if (exeLower == "discrust.exe" || exeLower == "disliterust.exe" || (exeLower == "explorer.exe" && titleLower == "program manager"))
                        return true;

                    bool hasAudio = activeAudioRootPids.Contains(rootPid)
                        || activeAudioRootPids.Contains(pid)
                        || activeAudioExes.Contains(exeName);

                    results.Add(new CapturableWindowEntry
                    {
                        Hwnd = hwnd.ToInt64(),
                        Pid = pid,
                        RootPid = rootPid != 0 ? rootPid : pid,
                        Title = title,
                        Exe = exeName,
                        Width = w,
                        Height = h,
                        HasAudio = hasAudio
                    });
                    return true;
                }, IntPtr.Zero);
            }
            catch { }
            return results;
        }

        private static string EscapeJsonStr(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", " ");
        }

        private void PushCapturableWindowsToWebView()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                try
                {
                    var wins = ScanCapturableApplicationWindows();
                    StringBuilder sb = new StringBuilder("[");
                    for (int i = 0; i < wins.Count; i++)
                    {
                        var w = wins[i];
                        if (i > 0) sb.Append(",");
                        sb.AppendFormat(
                            "{{\"hwnd\":{0},\"pid\":{1},\"rootPid\":{2},\"title\":\"{3}\",\"exe\":\"{4}\",\"width\":{5},\"height\":{6},\"hasAudio\":{7}}}",
                            w.Hwnd, w.Pid, w.RootPid, EscapeJsonStr(w.Title), EscapeJsonStr(w.Exe), w.Width, w.Height, w.HasAudio ? "true" : "false"
                        );
                    }
                    sb.Append("]");
                    string json = sb.ToString();
                    this.BeginInvoke((Action)(() =>
                    {
                        try
                        {
                            if (webView != null && webView.CoreWebView2 != null)
                                webView.CoreWebView2.ExecuteScriptAsync("window.__lcUpdateCapturableWindows&&window.__lcUpdateCapturableWindows(" + json + ");");
                        }
                        catch { }
                    }));
                }
                catch { }
            });
        }

        private List<WasapiEndpointCapturer> OpenTargetedCapturers(string targetSpecJson, out string lockedLabel, out uint lockedPrimaryPid)
        {
            lockedLabel = "Selected Application";
            lockedPrimaryPid = 0;
            var list = new List<WasapiEndpointCapturer>();
            try
            {
                uint myPid = (uint)Process.GetCurrentProcess().Id;
                var procMap = GetSystemProcessTable();
                var wins = ScanCapturableApplicationWindows();

                string surface = "window";
                string deviceId = "";
                string label = "";
                int width = 0, height = 0;
                long explicitPid = 0;

                if (!string.IsNullOrEmpty(targetSpecJson))
                {
                    Match mSurf = Regex.Match(targetSpecJson, "\"surface\"\\s*:\\s*\"([^\"]*)\"");
                    if (mSurf.Success) surface = mSurf.Groups[1].Value.Trim().ToLowerInvariant();

                    Match mDev = Regex.Match(targetSpecJson, "\"deviceId\"\\s*:\\s*\"([^\"]*)\"");
                    if (mDev.Success) deviceId = mDev.Groups[1].Value.Trim();

                    Match mLbl = Regex.Match(targetSpecJson, "\"label\"\\s*:\\s*\"([^\"]*)\"");
                    if (mLbl.Success) label = mLbl.Groups[1].Value.Trim();

                    Match mW = Regex.Match(targetSpecJson, "\"width\"\\s*:\\s*(\\d+)");
                    if (mW.Success) int.TryParse(mW.Groups[1].Value, out width);

                    Match mH = Regex.Match(targetSpecJson, "\"height\"\\s*:\\s*(\\d+)");
                    if (mH.Success) int.TryParse(mH.Groups[1].Value, out height);

                    Match mPid = Regex.Match(targetSpecJson, "\"explicitPid\"\\s*:\\s*(-?\\d+)");
                    if (mPid.Success) long.TryParse(mPid.Groups[1].Value, out explicitPid);
                }

                bool isMonitorShare = (explicitPid == -1)
                    || surface == "monitor"
                    || deviceId.StartsWith("screen:", StringComparison.OrdinalIgnoreCase)
                    || label.StartsWith("screen:", StringComparison.OrdinalIgnoreCase);

                if (isMonitorShare && explicitPid <= 0)
                {
                    lockedLabel = "Entire Screen (System Audio excluding DisCRust)";
                    lockedPrimaryPid = myPid;
                    var sysCap = WasapiEndpointCapturer.CreateProcessLoopbackForProcess(myPid, false);
                    if (sysCap != null) list.Add(sysCap);
                    return list;
                }

                uint resolvedPid = 0;
                if (explicitPid > 0)
                {
                    resolvedPid = (uint)explicitPid;
                }

                if (resolvedPid == 0)
                {
                    foreach (string candidate in new string[] { deviceId, label })
                    {
                        if (string.IsNullOrEmpty(candidate)) continue;
                        Match mWin = Regex.Match(candidate, @"window:(\d+)", RegexOptions.IgnoreCase);
                        if (mWin.Success)
                        {
                            long hwndVal = 0;
                            if (long.TryParse(mWin.Groups[1].Value, out hwndVal) && hwndVal != 0)
                            {
                                IntPtr hwndPtr = (IntPtr)hwndVal;
                                if (IsWindow(hwndPtr))
                                {
                                    uint wPid = UnwrapWindowProcessId(hwndPtr, procMap);
                                    if (wPid != 0 && wPid != myPid)
                                    {
                                        resolvedPid = wPid;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                if (resolvedPid == 0 && !string.IsNullOrEmpty(label)
                    && !label.StartsWith("window:", StringComparison.OrdinalIgnoreCase)
                    && !label.Equals("window", StringComparison.OrdinalIgnoreCase))
                {
                    foreach (var w in wins)
                    {
                        if (w.Title.Equals(label, StringComparison.OrdinalIgnoreCase)
                            || w.Exe.Equals(label, StringComparison.OrdinalIgnoreCase))
                        {
                            resolvedPid = w.RootPid;
                            break;
                        }
                    }
                    if (resolvedPid == 0)
                    {
                        foreach (var w in wins)
                        {
                            if (w.Title.IndexOf(label, StringComparison.OrdinalIgnoreCase) >= 0
                                || label.IndexOf(w.Title, StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                resolvedPid = w.RootPid;
                                break;
                            }
                        }
                    }
                }

                if (resolvedPid == 0 && width > 100 && height > 100)
                {
                    CapturableWindowEntry bestDimMatch = null;
                    int bestDiff = int.MaxValue;
                    foreach (var w in wins)
                    {
                        int diff = Math.Abs(w.Width - width) + Math.Abs(w.Height - height);
                        if (diff <= 48)
                        {
                            int score = diff - (w.HasAudio ? 200 : 0);
                            if (score < bestDiff)
                            {
                                bestDiff = score;
                                bestDimMatch = w;
                            }
                        }
                    }
                    if (bestDimMatch != null) resolvedPid = bestDimMatch.RootPid;
                }

                if (resolvedPid == 0)
                {
                    foreach (var w in wins)
                    {
                        if (w.HasAudio)
                        {
                            resolvedPid = w.RootPid;
                            break;
                        }
                    }
                }

                if (resolvedPid == 0 && wins.Count > 0)
                {
                    resolvedPid = wins[0].RootPid;
                }

                if (resolvedPid != 0 && resolvedPid != myPid)
                {
                    string targetExe;
                    uint rootPid = ResolveRootProcessForSameExe(resolvedPid, procMap, out targetExe);
                    if (rootPid == 0) rootPid = resolvedPid;
                    lockedPrimaryPid = rootPid;
                    lockedLabel = !string.IsNullOrEmpty(targetExe) ? (targetExe + " (PID " + rootPid + ")") : ("PID " + rootPid);

                    var rootPidsToCapture = new List<uint> { rootPid };
                    if (!string.IsNullOrEmpty(targetExe))
                    {
                        string tLower = targetExe.ToLowerInvariant();
                        if (tLower != "discrust.exe" && tLower != "disliterust.exe" && tLower != "explorer.exe" && tLower != "svchost.exe")
                        {
                            foreach (var kv in procMap)
                            {
                                if (rootPidsToCapture.Count >= 3) break;
                                if ((kv.Value.Item2 ?? "").Equals(targetExe, StringComparison.OrdinalIgnoreCase))
                                {
                                    string dummyExe;
                                    uint otherRoot = ResolveRootProcessForSameExe(kv.Key, procMap, out dummyExe);
                                    if (otherRoot != 0 && otherRoot != myPid && !rootPidsToCapture.Contains(otherRoot))
                                    {
                                        rootPidsToCapture.Add(otherRoot);
                                    }
                                }
                            }
                        }
                    }

                    foreach (uint pidToCap in rootPidsToCapture)
                    {
                        var appCap = WasapiEndpointCapturer.CreateProcessLoopbackForProcess(pidToCap, true);
                        if (appCap != null) list.Add(appCap);
                    }
                }
            }
            catch { }
            return list;
        }

        private void UpdateTaskbarAndTrayBadge(int mentions, bool unread, bool muted, bool deafened, bool streaming, bool voiceConnected)
        {
            if (!this.IsHandleCreated) return;
            try
            {
                ITaskbarList3 tb = (ITaskbarList3)(new TaskbarListComObject());
                tb.HrInit();

                bool showBadge = (mentions > 0) || unread || voiceConnected;
                if (!showBadge)
                {
                    tb.SetOverlayIcon(this.Handle, IntPtr.Zero, null);
                    if (baseAppIcon != null && trayNotify != null) trayNotify.Icon = baseAppIcon;
                    return;
                }

                using (Bitmap bmp = new Bitmap(32, 32))
                {
                    using (Graphics g = Graphics.FromImage(bmp))
                    {
                        g.SmoothingMode = SmoothingMode.AntiAlias;
                        g.Clear(Color.Transparent);

                        Color badgeColor = Color.FromArgb(242, 63, 67);
                        string badgeLabel = "";

                        if (voiceConnected && (deafened || muted))
                        {
                            badgeColor = Color.FromArgb(242, 63, 67);
                            badgeLabel = "M";
                        }
                        else if (voiceConnected && streaming)
                        {
                            badgeColor = Color.FromArgb(145, 70, 255);
                            badgeLabel = "S";
                        }
                        else if (mentions > 0)
                        {
                            badgeColor = Color.FromArgb(242, 63, 67);
                            badgeLabel = mentions > 9 ? "9+" : mentions.ToString();
                        }
                        else if (voiceConnected)
                        {
                            badgeColor = Color.FromArgb(35, 165, 90);
                            badgeLabel = "";
                        }
                        else if (unread)
                        {
                            badgeColor = Color.FromArgb(242, 63, 67);
                            badgeLabel = "";
                        }

                        if (string.IsNullOrEmpty(badgeLabel) && unread && !voiceConnected)
                        {
                            using (SolidBrush darkB = new SolidBrush(Color.FromArgb(17, 18, 20)))
                            using (SolidBrush fillB = new SolidBrush(badgeColor))
                            {
                                g.FillEllipse(darkB, 8, 8, 20, 20);
                                g.FillEllipse(fillB, 11, 11, 14, 14);
                            }
                        }
                        else
                        {
                            using (SolidBrush darkB = new SolidBrush(Color.FromArgb(17, 18, 20)))
                            using (SolidBrush fillB = new SolidBrush(badgeColor))
                            {
                                g.FillEllipse(darkB, 2, 2, 28, 28);
                                g.FillEllipse(fillB, 4, 4, 24, 24);
                            }
                            if (!string.IsNullOrEmpty(badgeLabel))
                            {
                                float fontSize = badgeLabel.Length > 1 ? 9.5f : 11.5f;
                                using (Font f = new Font("Segoe UI", fontSize, FontStyle.Bold, GraphicsUnit.Point))
                                using (SolidBrush whiteB = new SolidBrush(Color.White))
                                using (StringFormat sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
                                {
                                    g.DrawString(badgeLabel, f, whiteB, new RectangleF(3, 4, 26, 25), sf);
                                }
                            }
                            else if (voiceConnected)
                            {
                                using (SolidBrush whiteB = new SolidBrush(Color.White))
                                {
                                    g.FillEllipse(whiteB, 12, 12, 8, 8);
                                }
                            }
                        }
                    }

                    IntPtr hIcon = bmp.GetHicon();
                    try
                    {
                        tb.SetOverlayIcon(this.Handle, hIcon, "DisCRust Status");
                    }
                    finally
                    {
                        DestroyIcon(hIcon);
                    }
                }
            }
            catch { }
        }

        private void StartTargetedAudioLoopback(string targetSpecJson)
        {
            int sessionId = Interlocked.Increment(ref currentLoopbackSessionId);
            loopbackActive = true;
            Thread t = new Thread(() =>
            {
                PrepareWindowsForScreenSharePicker();
                string lockedLabel;
                uint lockedPid;
                List<WasapiEndpointCapturer> capturers = OpenTargetedCapturers(targetSpecJson, out lockedLabel, out lockedPid);

                try
                {
                    string safeLbl = EscapeJsonStr(lockedLabel);
                    this.BeginInvoke((Action)(() =>
                    {
                        try
                        {
                            if (webView != null && webView.CoreWebView2 != null)
                                webView.CoreWebView2.ExecuteScriptAsync("window.__lcOnStreamAudioTargetLocked&&window.__lcOnStreamAudioTargetLocked(\"" + safeLbl + "\"," + lockedPid + ");");
                        }
                        catch { }
                    }));
                }
                catch { }

                int ticks = 0;
                const int CHUNK_SAMPLES = 3840; // 1920 stereo frames = 40ms @ 48kHz
                while (loopbackActive && currentLoopbackSessionId == sessionId)
                {
                    Thread.Sleep(12);
                    ticks++;
                    if (capturers.Count == 0 && ticks % 160 == 0)
                    {
                        string retryLbl;
                        uint retryPid;
                        capturers = OpenTargetedCapturers(targetSpecJson, out retryLbl, out retryPid);
                    }

                    foreach (var c in capturers) c.DrainPackets();

                    int sentThisTick = 0;
                    while (sentThisTick < 4)
                    {
                        bool anyReady = false;
                        foreach (var c in capturers)
                        {
                            if (c.SampleFifo.Count >= CHUNK_SAMPLES) { anyReady = true; break; }
                        }
                        if (!anyReady) break;
                        sentThisTick++;

                        int[] mix = new int[CHUNK_SAMPLES];
                        foreach (var c in capturers)
                        {
                            if (c.SampleFifo.Count >= CHUNK_SAMPLES)
                            {
                                for (int i = 0; i < CHUNK_SAMPLES; i++)
                                    mix[i] += c.SampleFifo.Dequeue();
                            }
                        }
                        byte[] pcmBytes = new byte[CHUNK_SAMPLES * 2];
                        int maxAbs = 0;
                        for (int i = 0; i < CHUNK_SAMPLES; i++)
                        {
                            int v = mix[i];
                            if (v > 32767) v = 32767;
                            else if (v < -32768) v = -32768;
                            int abs = v < 0 ? -v : v;
                            if (abs > maxAbs) maxAbs = abs;
                            short s = (short)v;
                            pcmBytes[i * 2] = (byte)(s & 0xff);
                            pcmBytes[i * 2 + 1] = (byte)((s >> 8) & 0xff);
                        }
                        if (maxAbs > 1)
                        {
                            string b64 = Convert.ToBase64String(pcmBytes);
                            try
                            {
                                this.BeginInvoke((Action)(() =>
                                {
                                    try
                                    {
                                        if (webView != null && webView.CoreWebView2 != null)
                                            webView.CoreWebView2.ExecuteScriptAsync("window.__lcOnNativeAudioPcmChunk&&window.__lcOnNativeAudioPcmChunk('" + b64 + "');");
                                    }
                                    catch { }
                                }));
                            }
                            catch { }
                        }
                    }
                }
                foreach (var c in capturers) c.Cleanup();
            });
            t.IsBackground = true;
            t.SetApartmentState(ApartmentState.MTA);
            t.Start();
        }

        private string BuildVencordScript(string cfgJson)
        {
            bool vcEnabled = ReadJsonBool(cfgJson, "VencordEnabled", true);
            if (!vcEnabled) return "";
            string vcDir = Path.Combine(dataRoot, "Vencord");
            string vcJsPath = Path.Combine(vcDir, "browser.js");
            if (!File.Exists(vcJsPath)) vcJsPath = Path.Combine(installDir, "Vencord", "browser.js");
            string vcCssPath = Path.Combine(Path.GetDirectoryName(vcJsPath), "browser.css");
            if (!File.Exists(vcJsPath)) return "";
            try
            {
                string vcJs = File.ReadAllText(vcJsPath, Encoding.UTF8);
                if (vcJs.Length < 1000 || vcJs.TrimStart().StartsWith("<")) return "";
                string vcCss = File.Exists(vcCssPath) ? File.ReadAllText(vcCssPath, Encoding.UTF8) : "";
                string cssB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(vcCss));
                StringBuilder sb = new StringBuilder();
                sb.Append("try { if (window === window.top && typeof window.Vencord === 'undefined') {\n");
                sb.Append(vcJs);
                sb.Append("\n;try { if (typeof Vencord !== 'undefined') window.Vencord = Vencord; } catch(e) {}\n");
                sb.Append("(() => { const injectVcCss = () => { if (document.getElementById('litecord-vencord-css')) return; const s = document.createElement('style'); s.id = 'litecord-vencord-css'; s.textContent = window.atob('").Append(cssB64).Append("'); (document.head || document.documentElement).appendChild(s); }; if (document.head || document.documentElement) injectVcCss(); window.addEventListener('DOMContentLoaded', injectVcCss); })();\n");
                sb.Append("} } catch (vcErr) { console.error('[DisCRust] Vencord init error:', vcErr); }\n");
                return sb.ToString();
            }
            catch { return ""; }
        }

        private string BuildEngineOnlyScript()
        {
            if (string.IsNullOrEmpty(injectedJsTemplate)) return "";
            string rawCfg = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
            string cfgJson = SanitizeJsonOrDefault(rawCfg);
            if (cfgJson != rawCfg)
            {
                try { File.WriteAllText(configPath, cfgJson, Encoding.UTF8); } catch { }
            }
            string rawMirror = File.Exists(mirrorPath) ? File.ReadAllText(mirrorPath, Encoding.UTF8) : "{}";
            string mirrorJson = SanitizeJsonOrDefault(rawMirror);

            string cfgB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(cfgJson));
            string mirrorB64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(mirrorJson));

            string safeCfgExpr = "(function(){try{return JSON.parse(decodeURIComponent(escape(window.atob('" + cfgB64 + "'))));}catch(e){return {};}})()";
            string safeMirrorExpr = "(function(){try{return JSON.parse(decodeURIComponent(escape(window.atob('" + mirrorB64 + "'))));}catch(e){return {};}})()";

            return injectedJsTemplate
                .Replace("__INITIAL_CONFIG_JSON__", safeCfgExpr)
                .Replace("__INITIAL_STORAGE_MIRROR_JSON__", safeMirrorExpr);
        }

        private async Task InitializeWebViewAsync()
        {
            string userDataDir = Path.Combine(dataRoot, "UserData");
            Directory.CreateDirectory(userDataDir);
            string args = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-features=UseEcoQoSForBackgroundProcess,WebRtcHideLocalIpsWithMdns,msWebOOUI,msPdfOOUI,Translate,SpareRendererForSitePerProcess --enable-features=VaapiVideoEncoder --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist --renderer-process-limit=2 --js-flags=--max-old-space-size=256";
            var opts = new CoreWebView2EnvironmentOptions(args);
            var env = await CoreWebView2Environment.CreateAsync(null, userDataDir, opts);
            await webView.EnsureCoreWebView2Async(env);

            webView.CoreWebView2.Settings.IsWebMessageEnabled = true;
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.AreDevToolsEnabled = true;
            webView.CoreWebView2.Settings.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Electron/32.8.0";

            webView.CoreWebView2.PermissionRequested += (s, e) =>
            {
                e.State = CoreWebView2PermissionState.Allow;
                e.Handled = true;
            };

            string rawCfg = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
            string vcScript = BuildVencordScript(SanitizeJsonOrDefault(rawCfg));
            if (!string.IsNullOrEmpty(vcScript))
            {
                await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(vcScript);
            }

            string engineScript = BuildEngineOnlyScript();
            if (!string.IsNullOrEmpty(engineScript))
            {
                await webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(engineScript);
            }

            // Guarantee custom interface mounts even on cached Service Worker boot or page reload!
            webView.CoreWebView2.NavigationCompleted += async (s, e) =>
            {
                try
                {
                    string checkAndMount = "if (!window.__discrustEngineMounted) { " + BuildEngineOnlyScript() + " }";
                    await webView.CoreWebView2.ExecuteScriptAsync(checkAndMount);
                }
                catch { }
            };

            if (currentUiScaleStep != 0)
            {
                try { webView.ZoomFactor = Math.Max(0.5, Math.Min(1.5, 1.0 + (currentUiScaleStep * 0.05))); } catch { }
            }

            webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
            webView.CoreWebView2.Navigate("https://discord.com/app");
        }

        private void RestoreAndFocusWindow()
        {
            this.TopMost = false;
            if (this.WindowState == FormWindowState.Minimized)
                this.WindowState = FormWindowState.Normal;
            this.Show();
            this.Activate();
            SetForegroundWindow(this.Handle);
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg = null;
            try { msg = e.TryGetWebMessageAsString(); } catch { }
            if (string.IsNullOrEmpty(msg)) return;

            int idx = msg.IndexOf(':');
            string cmd = idx >= 0 ? msg.Substring(0, idx) : msg;
            string payload = idx >= 0 ? msg.Substring(idx + 1) : "";

            switch (cmd)
            {
                case "WIN_DRAG_START":
                case "DRAG_WINDOW":
                    dragStartCursor = Cursor.Position;
                    dragStartBounds = this.Bounds;
                    dragOrResizeMode = 1;
                    dragResizeTimer.Start();
                    break;
                case "WIN_RESIZE_EDGE":
                    if (!isWorkAreaMaximized)
                    {
                        activeResizeDir = payload.Trim().ToLowerInvariant();
                        dragStartCursor = Cursor.Position;
                        dragStartBounds = this.Bounds;
                        dragOrResizeMode = 2;
                        dragResizeTimer.Start();
                    }
                    break;
                case "WIN_MINIMIZE":
                case "WIN_MIN":
                    this.WindowState = FormWindowState.Minimized;
                    break;
                case "WIN_MAXIMIZE_TOGGLE":
                case "WIN_MAX":
                    ToggleWorkAreaMaximize();
                    break;
                case "WIN_CLOSE":
                case "EXIT_APP":
                case "QUIT_APP":
                    Application.Exit();
                    break;
                case "RESTART_APP":
                case "RELAUNCH_APP":
                    Process.Start(Application.ExecutablePath);
                    Application.Exit();
                    break;
                case "FOCUS_MAIN_WINDOW":
                    RestoreAndFocusWindow();
                    break;
                case "SET_UI_SCALE_STEP":
                    int step;
                    if (int.TryParse(payload.Trim(), out step))
                    {
                        currentUiScaleStep = Math.Max(-10, Math.Min(10, step));
                        try { webView.ZoomFactor = Math.Max(0.5, Math.Min(1.5, 1.0 + (currentUiScaleStep * 0.05))); } catch { }
                        SetConfigLiteral("DiscordUiScaleStep", currentUiScaleStep.ToString());
                    }
                    break;
                case "SET_CUSTOM_NAME":
                    string cleanName = payload.Trim().Replace("\"", "");
                    if (string.IsNullOrEmpty(cleanName)) cleanName = "DisCRust";
                    this.Text = cleanName;
                    SetConfigLiteral("CustomAppName", "\"" + cleanName + "\"");
                    break;
                case "SET_LAUNCH_MODE":
                    SetConfigLiteral("StartupLaunchMode", "\"" + payload.Trim().Replace("\"", "") + "\"");
                    break;
                case "SET_QUEST_ONLY_MODE":
                    bool qo = payload.Trim() == "1" || payload.Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                    SetConfigLiteral("QuestOnlyModeActive", qo ? "true" : "false");
                    break;
                case "SAVE_PANEL_SIZES":
                    string[] ps = payload.Split(',');
                    if (ps.Length >= 3)
                    {
                        SetConfigLiteral("LeftAccountsPanelWidth", ps[0].Trim());
                        SetConfigLiteral("RightQuestPanelWidth", ps[1].Trim());
                        SetConfigLiteral("QuestHudListHeight", ps[2].Trim());
                    }
                    break;
                case "SAVE_ACCOUNTS_JSON":
                    SetConfigLiteral("SavedAccounts", payload);
                    break;
                case "TOGGLE_TITLEBAR_PAGETITLE":
                    ToggleBooleanConfigKey("ShowTitleBarPageTitle", true);
                    break;
                case "TOGGLE_TITLEBAR_RAM":
                    ToggleBooleanConfigKey("ShowRamInTitleBar", true);
                    break;
                case "TOGGLE_REDUCE_MOTION":
                    ToggleBooleanConfigKey("ReduceMotion", false);
                    break;
                case "TOGGLE_ECO":
                    ToggleBooleanConfigKey("EfficiencyMode", true);
                    break;
                case "TOGGLE_AUTO_TRIM":
                    ToggleBooleanConfigKey("AutoMemoryTrim", true);
                    break;
                case "TOGGLE_TITLEBAR_BTN":
                    ToggleBooleanConfigKey("ShowTitleBarButton", true);
                    ToggleBooleanConfigKey("ShowTitleBarConfigBtn", true);
                    break;
                case "TOGGLE_TITLEBAR_QUEST_BTN":
                    ToggleBooleanConfigKey("ShowTitleBarQuestBtn", true);
                    break;
                case "TOGGLE_TITLEBAR_SHORTCUTS_BTN":
                    ToggleBooleanConfigKey("ShowTitleBarShortcutsBtn", true);
                    break;
                case "SAVE_SHORTCUTS_JSON":
                    SetConfigLiteral("ShortcutsJson", "\"" + EscapeJsonStr(payload) + "\"");
                    break;
                case "SET_TITLEBAR_COLOR":
                    UpdateWindowRoundedCorners(isWorkAreaMaximized);
                    break;
                case "TOGGLE_NOTIFICATIONS":
                    ToggleBooleanConfigKey("DesktopNotificationsEnabled", true);
                    break;
                case "TOGGLE_PRIVACY_NAME":
                    ToggleBooleanConfigKey("PrivacyHideName", false);
                    break;
                case "TOGGLE_PRIVACY_USERID":
                    ToggleBooleanConfigKey("PrivacyHideUserId", false);
                    break;
                case "TOGGLE_PRIVACY_PROFILE":
                    ToggleBooleanConfigKey("PrivacyHideProfile", false);
                    break;
                case "ENABLE_ALL_PRIVACY_MASKS":
                    SetConfigLiteral("PrivacyHideName", "true");
                    SetConfigLiteral("PrivacyHideUserId", "true");
                    SetConfigLiteral("PrivacyHideProfile", "true");
                    break;
                case "DISABLE_ALL_PRIVACY_MASKS":
                    SetConfigLiteral("PrivacyHideName", "false");
                    SetConfigLiteral("PrivacyHideUserId", "false");
                    SetConfigLiteral("PrivacyHideProfile", "false");
                    break;
                case "TOGGLE_QUEST_HELPER":
                    ToggleBooleanConfigKey("QuestHelperEnabled", true);
                    break;
                case "DISABLE_QUEST_HELPER":
                    SetConfigLiteral("QuestHelperEnabled", "false");
                    break;
                case "TOGGLE_QUEST_AUTOSCAN":
                    ToggleBooleanConfigKey("QuestAutoScan", true);
                    break;
                case "TOGGLE_QUEST_AUTOSTART":
                    ToggleBooleanConfigKey("QuestAutoStart", false);
                    break;
                case "TOGGLE_QUEST_DESKTOP_DEFAULT":
                    ToggleBooleanConfigKey("QuestDesktopByDefault", true);
                    break;
                case "TOGGLE_QUEST_AUTOFAB":
                    ToggleBooleanConfigKey("QuestAutoCollapseFab", false);
                    break;
                case "TOGGLE_VENCORD":
                    ToggleBooleanConfigKey("VencordEnabled", true);
                    break;
                case "TOGGLE_QFILTER_ORBS":
                    ToggleBooleanConfigKey("QuestFilterOrbs", true);
                    break;
                case "TOGGLE_QFILTER_FRAMES":
                    ToggleBooleanConfigKey("QuestFilterFrames", true);
                    break;
                case "TOGGLE_QFILTER_ADS":
                    ToggleBooleanConfigKey("QuestFilterAds", true);
                    break;
                case "TOGGLE_QFILTER_CODES":
                    ToggleBooleanConfigKey("QuestFilterCodes", true);
                    break;
                case "TOGGLE_QFILTER_NITRO":
                    ToggleBooleanConfigKey("QuestFilterNitro", true);
                    break;
                case "REQUEST_CONFIG_SYNC":
                    SyncConfigToWebView();
                    break;
                case "SAVE_CONFIG":
                    try { File.WriteAllText(configPath, payload, Encoding.UTF8); } catch { }
                    break;
                case "SYNC_STORAGE_MIRROR":
                    try { File.WriteAllText(mirrorPath, payload, Encoding.UTF8); } catch { }
                    break;
                case "SCAN_CAPTURABLE_WINDOWS":
                    ThreadPool.QueueUserWorkItem(_ => PrepareWindowsForScreenSharePicker());
                    PushCapturableWindowsToWebView();
                    break;
                case "START_AUDIO_LOOPBACK":
                    StartTargetedAudioLoopback(payload);
                    break;
                case "STOP_AUDIO_LOOPBACK":
                    loopbackActive = false;
                    Interlocked.Increment(ref currentLoopbackSessionId);
                    break;
                case "SCREENSHARE_STARTED":
                case "SCREENSHARE_PICKER_OPENED":
                    ThreadPool.QueueUserWorkItem(_ => PrepareWindowsForScreenSharePicker());
                    SuppressWebViewScreenSharePopups();
                    PushCapturableWindowsToWebView();
                    break;
                case "HIDE_SCREENSHARE_POPUP":
                    SuppressWebViewScreenSharePopups();
                    break;
                case "SCREENSHARE_STREAM_ACQUIRED":
                    SuppressWebViewScreenSharePopups();
                    RestoreAndFocusWindow();
                    Task.Delay(50).ContinueWith(_ => this.BeginInvoke((Action)(() => { SuppressWebViewScreenSharePopups(); RestoreAndFocusWindow(); })));
                    Task.Delay(180).ContinueWith(_ => this.BeginInvoke((Action)(() => { SuppressWebViewScreenSharePopups(); RestoreAndFocusWindow(); })));
                    break;
                case "TRIM_MEMORY":
                case "MENU_OPENED":
                case "REQUEST_STATS":
                    TrimAllWebViewAndHostMemory();
                    break;
                case "SET_OTA_MANIFEST_URL":
                    SetConfigLiteral("OtaManifestUrl", "\"" + EscapeJsonStr(payload.Trim()) + "\"");
                    break;
                case "RUN_UPDATE_ALL_NOW":
                    ThreadPool.QueueUserWorkItem(_ =>
                    {
                        string newVer = APP_VERSION;
                        bool hotReloadJs = false;
                        try
                        {
                            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
                            string rawCfg = File.Exists(configPath) ? File.ReadAllText(configPath, Encoding.UTF8) : "{}";
                            Match mUrl = Regex.Match(rawCfg, "\"OtaManifestUrl\"\\s*:\\s*\"([^\"]+)\"");
                            string otaUrl = mUrl.Success ? mUrl.Groups[1].Value.Trim() : "https://raw.githubusercontent.com/VoxMortis/DisCRust/main/ota_manifest.json";

                            using (WebClient wc = new WebClient())
                            {
                                wc.Encoding = Encoding.UTF8;
                                wc.Headers["Cache-Control"] = "no-cache";
                                wc.Headers["User-Agent"] = "DisCRust-OTA-Updater/0.6.6";

                                string vcDir = Path.Combine(dataRoot, "Vencord");
                                Directory.CreateDirectory(vcDir);
                                try
                                {
                                    string vjs = wc.DownloadString("https://raw.githubusercontent.com/Vencord/builds/main/browser.js");
                                    if (!string.IsNullOrEmpty(vjs) && vjs.Length > 50000)
                                        File.WriteAllText(Path.Combine(vcDir, "browser.js"), vjs, Encoding.UTF8);
                                    string vcss = wc.DownloadString("https://raw.githubusercontent.com/Vencord/builds/main/browser.css");
                                    if (!string.IsNullOrEmpty(vcss))
                                        File.WriteAllText(Path.Combine(vcDir, "browser.css"), vcss, Encoding.UTF8);
                                }
                                catch { }

                                if (otaUrl.StartsWith("http://") || otaUrl.StartsWith("https://"))
                                {
                                    string sep = otaUrl.Contains("?") ? "&" : "?";
                                    string manifestJson = wc.DownloadString(otaUrl + sep + "t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                                    Match mv = Regex.Match(manifestJson, "\"version\"\\s*:\\s*\"([^\"]+)\"");
                                    if (mv.Success && !string.IsNullOrEmpty(mv.Groups[1].Value))
                                        newVer = mv.Groups[1].Value.Trim();

                                    string srcDir = Path.Combine(dataRoot, "src");
                                    Directory.CreateDirectory(srcDir);

                                    Match mJs = Regex.Match(manifestJson, "\"engine_js_url\"\\s*:\\s*\"([^\"]+)\"");
                                    if (mJs.Success && mJs.Groups[1].Value.StartsWith("http"))
                                    {
                                        string jsUrl = mJs.Groups[1].Value.Trim();
                                        string jsSep = jsUrl.Contains("?") ? "&" : "?";
                                        string newJs = wc.DownloadString(jsUrl + jsSep + "t=" + DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                                        if (!string.IsNullOrEmpty(newJs) && newJs.Length > 80000 && newJs.Contains("__discrustEngineMounted"))
                                        {
                                            File.WriteAllText(Path.Combine(srcDir, "injected_engine.js"), newJs, Encoding.UTF8);
                                            try { File.WriteAllText(Path.Combine(installDir, "src", "injected_engine.js"), newJs, Encoding.UTF8); } catch { }
                                            injectedJsTemplate = newJs;
                                            hotReloadJs = true;
                                        }
                                    }

                                    Match mCs = Regex.Match(manifestJson, "\"native_host_cs_url\"\\s*:\\s*\"([^\"]+)\"");
                                    if (mCs.Success && mCs.Groups[1].Value.StartsWith("http"))
                                    {
                                        try
                                        {
                                            string newCs = wc.DownloadString(mCs.Groups[1].Value.Trim());
                                            if (!string.IsNullOrEmpty(newCs) && newCs.Length > 20000)
                                                File.WriteAllText(Path.Combine(srcDir, "DisLiteNativeHost.cs"), newCs, Encoding.UTF8);
                                        }
                                        catch { }
                                    }

                                    Match mRs = Regex.Match(manifestJson, "\"main_rs_url\"\\s*:\\s*\"([^\"]+)\"");
                                    if (mRs.Success && mRs.Groups[1].Value.StartsWith("http"))
                                    {
                                        try
                                        {
                                            string newRs = wc.DownloadString(mRs.Groups[1].Value.Trim());
                                            if (!string.IsNullOrEmpty(newRs) && newRs.Length > 20000)
                                                File.WriteAllText(Path.Combine(srcDir, "main.rs"), newRs, Encoding.UTF8);
                                        }
                                        catch { }
                                    }
                                }
                            }
                        }
                        catch { }

                        SetConfigLiteral("AppVersion", "\"" + EscapeJsonStr(newVer) + "\"");
                        this.BeginInvoke((Action)(() =>
                        {
                            try
                            {
                                if (webView != null && webView.CoreWebView2 != null)
                                {
                                    webView.CoreWebView2.ExecuteScriptAsync(
                                        "window.__lcOnUpdateAllCompleted&&window.__lcOnUpdateAllCompleted(true,\"" + EscapeJsonStr(newVer) + "\"," + (hotReloadJs ? "true" : "false") + ");"
                                    );
                                }
                            }
                            catch { }
                        }));
                    });
                    break;
                case "UPDATE_TASKBAR_STATE":
                    try
                    {
                        string[] tp = payload.Split(',');
                        if (tp.Length >= 6)
                        {
                            int mCnt = 0;
                            int.TryParse(tp[0].Trim(), out mCnt);
                            bool uDot = tp[1].Trim() == "1" || tp[1].Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                            bool isM = tp[2].Trim() == "1" || tp[2].Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                            bool isD = tp[3].Trim() == "1" || tp[3].Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                            bool isS = tp[4].Trim() == "1" || tp[4].Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                            bool isV = tp[5].Trim() == "1" || tp[5].Trim().Equals("true", StringComparison.OrdinalIgnoreCase);
                            UpdateTaskbarAndTrayBadge(mCnt, uDot, isM, isD, isS, isV);
                        }
                    }
                    catch { }
                    break;
                case "SHOW_NOTIFICATION":
                    try
                    {
                        string title = "DisCRust";
                        string body = payload;
                        Match mt = Regex.Match(payload, "\"title\"\\s*:\\s*\"([^\"]+)\"");
                        Match mb = Regex.Match(payload, "\"body\"\\s*:\\s*\"([^\"]+)\"");
                        if (mt.Success) title = mt.Groups[1].Value;
                        if (mb.Success) body = mb.Groups[1].Value;
                        trayNotify.BalloonTipTitle = title;
                        trayNotify.BalloonTipText = body.Length > 180 ? body.Substring(0, 180) : body;
                        trayNotify.ShowBalloonTip(4000);
                    }
                    catch { }
                    break;
                case "OPEN_EXTERNAL_URL":
                    if (payload.StartsWith("http://") || payload.StartsWith("https://"))
                    {
                        try { Process.Start(new ProcessStartInfo(payload) { UseShellExecute = true }); } catch { }
                    }
                    break;
            }
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new DisCRustForm());
        }
    }
}
