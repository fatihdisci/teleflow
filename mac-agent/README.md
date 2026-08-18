# Teleflow Mac Agent

Bu özel servis Telegram kullanıcı hesabı bağlantısını Mac mini üzerinde tutar.
İstekleri yalnızca Teleflow uygulamasından kabul eder; Telegram oturumunu
`mac-agent/data/` altında şifreli saklar ve bot görsellerini yerelde indirir.

## Bir kez yapılacak kurulum

1. Terminal'de `mac-agent` klasörüne girin.
2. İki gizli anahtar üretin. Çıktıları kimseyle paylaşmayın:

   ```zsh
   python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())'
   python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())'
   ```

3. `mac-agent/.env` dosyasını oluşturup ilk çıktıyı `TELEFLOW_AGENT_TOKEN`,
   ikinciyi `TELEFLOW_MASTER_KEY` olarak yazın.

   ```dotenv
   TELEFLOW_AGENT_TOKEN=ilk-cikti
   TELEFLOW_MASTER_KEY=ikinci-cikti
   ```

4. Ajanı başlatın:

   ```zsh
   chmod +x start.sh
   ./start.sh
   ```

5. `.env` oluşturulduktan sonra Mac açıldığında otomatik çalışması için:

   ```zsh
   chmod +x install-launch-agent.sh
   ./install-launch-agent.sh
   ```

6. `cloudflared` ile bir Cloudflare Tunnel oluşturun ve HTTPS alan adını
   `http://127.0.0.1:8787` adresine yönlendirin. Ajan anahtarını gizli tutun.

7. Sites ortam değişkenlerinde `MAC_AGENT_URL` değerini HTTPS alan adı;
   `MAC_AGENT_TOKEN` değerini de aynı ajan anahtarı olarak gizli değer şeklinde
   kaydedin. Bunların hiçbirini tarayıcıya veya repoya eklemeyin.

## Çalışma notları

- İlk kurulumda Telegram API değerlerini Teleflow'a girin; ardından kodu isteyin
  ve iki aşamalı doğrulama varsa tamamlayın.
- Ajan, Telegram `FLOOD_WAIT` bildirirse gereken süreyi bekleyip komutu yeniden dener.
- Görsel ve belge yanıtları `data/media/` altında tutulur. Web uygulaması bunları
  görüntülemek, kopyalamak, indirmek veya birleştirmek için geçici kapalı bağlantılar kullanır.
