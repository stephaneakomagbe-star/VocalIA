import wifi_qrcode_generator.wifi_qrcode_generator
from PIL import Image

ssid = "STEPH'S_WIFI"
password = "Steph_2007"
security = "WPA"

from wifi_qrcode_generator.generator import wifi_qrcode 
qr = wifi_qrcode(ssid, False, security, password)

qr.make_image().save("wifi_qr.png")
Image.open("wifi_qr.png")

#source code --> clcoding.com