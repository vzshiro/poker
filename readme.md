# Setup Project
### *This project & setup is meant for users running on Windows 10*
1. Install npm & Node.js
2. Run `npm install`

## Run Project
1. Run `npm start`
2. Navigate to http://localhost:3000 (by default)
3. To let others connect (LAN), go to CMD and run `ipconfig` to get your local IPv4 address
    - For online connections, refer to port forwarding (Search online)

## Notes
1. If anything feels wrong, it is usually recommended to refresh the page.
2. Try not to Logout when playing inside Lobby (it's handled but not guaranteed).
3. You may screen lock / close browser - **As long as the browser supports local cache**.

## Run on Termux (Android)
1. Install Termux from Google Play Store
2. Once done, run `apt update && apt upgrade -y`
3. Install git `pkg install git`
4. Clone source code from GitHub `git clone https://github.com/vzshiro/poker.git`
5. Get your IP `ifconfig`
6. Change directory, install dependencies and start `cd poker && npm i && npm start`
7. Enjoy hosting on Android phone

## Additional Notes
1. Refreshing the page on anytime shouldn't cause any issue (but try not to do so without reason).
2. It's possible to run this on Android, so that you may open up a hotspot / connect to same Wi-Fi to play with others.
3. This has only basic protection against abuse / hacking, it's not meant for highly secure chip calculation (Or for untrusted users).
4. In the case of decimal pool division, round down is performed.