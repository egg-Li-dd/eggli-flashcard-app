package com.eggli.flashcards.services;

import android.net.VpnService;
import android.os.ParcelFileDescriptor;
import android.os.Build;
import android.net.IpPrefix;
import java.net.InetAddress;
import libtailscale.VPNServiceBuilder;

/**
 * VPNServiceBuilder 实现 - 桥接 Android VpnService.Builder 和 libtailscale.VPNServiceBuilder
 * 使用 Java 编写以避免 Kotlin 平台类型兼容性问题
 */
public class VPNServiceBuilderImpl implements VPNServiceBuilder {

    private final VpnService.Builder builder;

    public VPNServiceBuilderImpl(VpnService.Builder builder) {
        this.builder = builder;
    }

    @Override
    public void addAddress(String address, int prefixLen) throws Exception {
        builder.addAddress(address, prefixLen);
    }

    @Override
    public void addDNSServer(String dnsServer) throws Exception {
        builder.addDnsServer(dnsServer);
    }

    @Override
    public void addRoute(String address, int prefixLen) throws Exception {
        builder.addRoute(address, prefixLen);
    }

    @Override
    public void addSearchDomain(String domain) throws Exception {
        builder.addSearchDomain(domain);
    }

    @Override
    public libtailscale.ParcelFileDescriptor establish() throws Exception {
        ParcelFileDescriptor pfd = builder.establish();
        if (pfd == null) {
            return null;
        }
        return new ParcelFileDescriptorAdapter(pfd);
    }

    @Override
    public void excludeRoute(String address, int prefixLen) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && address != null) {
            IpPrefix prefix = new IpPrefix(InetAddress.getByName(address), prefixLen);
            builder.excludeRoute(prefix);
        }
    }

    @Override
    public void setMTU(int mtu) throws Exception {
        builder.setMtu(mtu);
    }

    /**
     * 适配器 - 将 android.os.ParcelFileDescriptor 包装为 libtailscale.ParcelFileDescriptor
     */
    private static class ParcelFileDescriptorAdapter implements libtailscale.ParcelFileDescriptor {
        private final ParcelFileDescriptor pfd;

        ParcelFileDescriptorAdapter(ParcelFileDescriptor pfd) {
            this.pfd = pfd;
        }

        @Override
        public int detach() throws Exception {
            int fd = pfd.detachFd();
            return fd;
        }
    }
}
