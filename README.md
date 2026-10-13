# Clusterfudge

Firefox extension (with aspirations of chrome compatibility, though unlikelky given prior experience) to help navigating multiple elasticsearch clusers via Kibana and other tools. This list will gropw oer time, but inital fuiuicntionaliuty is quite simple;
User would configure 1 or more Elasticstack clusters via the ext preferences. These have at minimum a name (ie apac-test-1), and a url patttern (like  *.apac-test-1.sand.wtg.zone). Teh extension will genrate a tab colouring based on the name, or user may ovrride.
the extension then registers userscript to match the Url patterns  and when a tab is opened to a mathcing url (like https://kibana.apac-test-1.sand.wtg.zone) the tab's title will be coloured as per the generaste dor chjosen scheme and tab title will be prefixed withn teh clsuter name like apac-test-1:{{the preexisting title}} making sure to never prefix if title alreeeady beginas with the prefix
