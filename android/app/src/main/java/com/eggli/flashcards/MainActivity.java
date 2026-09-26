package com.eggli.flashcards;

import com.getcapacitor.BridgeActivity;
import com.eggli.flashcards.plugins.AudioRecorderPlugin;
import com.eggli.flashcards.plugins.VoskASRPlugin;
import com.eggli.flashcards.plugins.SystemFloatingWindowPlugin;
import com.capacitorjs.plugins.filesystem.FilesystemPlugin;
import com.getcapacitor.plugin.http.Http;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(AudioRecorderPlugin.class);
        registerPlugin(VoskASRPlugin.class);
        registerPlugin(SystemFloatingWindowPlugin.class);
        registerPlugin(FilesystemPlugin.class);
        registerPlugin(Http.class);
    }
}
